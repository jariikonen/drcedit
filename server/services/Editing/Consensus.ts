import { EventEmitter } from 'node:events';
import logger from '../../utils/logger';
import { HOST } from '../../utils/networkinfo';
import Messaging from '../Messaging';
import Discovery from '../Discovery';
import { CONSENSUS_ELMAX, CONSENSUS_ELMIN } from '../../utils/config';
import { NodeInfo } from '../../types';

export type NodeStatus = 'FOLLOWER' | 'CANDIDATE' | 'LEADER';

export interface NodeState {
  address: string;
  status: NodeStatus;
  term: number;
  electionTerm?: number;
  voted?: boolean;
  votes?: number;
  nodes?: string[];
}

export interface ElectionState {
  candidate: string;
  term: number;
  votes: string[];
  denied: string[];
  expired: boolean;
}

export function isElectionState(arg: unknown): arg is ElectionState {
  return (
    (arg as ElectionState).candidate !== undefined &&
    (arg as ElectionState).term !== undefined &&
    (arg as ElectionState).votes !== undefined &&
    (arg as ElectionState).denied !== undefined &&
    (arg as ElectionState).expired !== undefined
  );
}

export type ElectionMessageType = 'VOTEME' | 'OK' | 'DENIED' | 'LEADER';

const log = logger.child({ caller: 'Consensus' });

/**
 * Consensus implements a version of the RAFT consensus algorithm, that does
 * not require the log entries to be inputted in the same order in every node.
 * The class provides a public method for committing an update. The method
 * takes theupdate and a reference to the document state object as it's
 * parameters.
 *
 * Consensus instance communicates with other Consensus instances by sending
 * messages through the Messaging service (see Messaging.ts). When the service
 * is started it joins into a room (Socket.io communication channel)
 * 'consensus', which enables broadcasting messages to other instances in the
 * room. After that it starts the leader election.
 *
 * The nodes (different service instances) have three possible states in the
 * RAFT algorithm: follower, candidate and leader. Nodes start as followers.
 * When there is no leader in the system, and the electionTimeout has passed,
 * nodes turn themselves into candidates and send the other nodes a message
 * requesting votes to be elected as the leader. To be elected, it must receive
 * the majority of the votes. Node gives it's own vote to itself. Nodes grant
 * their vote if they haven't given it to some other node already and they are
 * not candidates themselves.
 *
 * Terms ... Heartbeats ... electionTimeout ...
 *
 * In practice the leader election ...
 *
 * Updates to the document states are logged into logs that are stored in the
 * Storage service. ...
 *
 */
export default class Consensus extends EventEmitter {
  #status: NodeStatus = 'FOLLOWER';

  #term: number;

  #leader: NodeState | null = null;

  #nodes: string[];

  #electionTimeout: NodeJS.Timeout | null = null;

  #electionState: Record<string, ElectionState | null> = {};

  /** Local Messaging service instance. */
  #messaging: Messaging | null;

  #discovery: Discovery;

  constructor(messaging: Messaging | null, discovery: Discovery) {
    super();
    this.#messaging = messaging;
    this.#discovery = discovery;

    this.#nodes = discovery.getNodeAddresses();
    this.#term = 0; // THIS SHOULD BE PERSISTED TO FILE AND READ FROM THERE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    log.debug(this.#discovery, 'TO SUPPRESS ESLINT ERROR'); // JUST TO SUPPRESS ESLINT - REMOVE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    if (this.#messaging) {
      this.#initializeMessaging();
      this.#initializeDiscovery();
      this.#startElection();
      log.info(`Consensus started (nodes: ${JSON.stringify(this.#nodes)})`);
    } else {
      log.info(
        `Consensus started without messaging service (nodes: ${JSON.stringify(
          this.#nodes
        )})`
      );
    }
  }

  #initializeMessaging() {
    if (!this.#messaging) throw new Error('no messaging service');
    if (!this.#messaging.isBroker()) this.#messaging.join('consensus');

    this.#messaging.on(
      'consensus',
      (
        subEvent: string,
        messageType: ElectionMessageType,
        nodeState: NodeState,
        ...args: unknown[]
      ) => {
        switch (subEvent) {
          case 'election':
            log.debug(
              `election message - ${messageType}, ${JSON.stringify(
                nodeState
              )}, ${JSON.stringify(args)}`
            );
            if (!isElectionState(args[0])) {
              throw new Error('no election state in election message');
            }
            this.#handleElection(messageType, nodeState, args[0]);
            break;
          default:
            throw new Error(
              `ran out of options - ${subEvent}, ${messageType}, ${JSON.stringify(
                nodeState
              )}`
            );
        }
      }
    );
  }

  #initializeDiscovery() {
    this.#discovery.on('nodes', (newNodes: NodeInfo[]) => {
      this.#nodes = newNodes.map((node) => node.address);
      log.info(`new nodes: ${JSON.stringify(this.#nodes)}`);
    });
  }

  #startElection() {
    this.#status = 'CANDIDATE';
    this.#term += 1;

    const myState = { ...this.getSimpleState() };
    const electionState: ElectionState = {
      candidate: HOST,
      term: this.#term,
      votes: [HOST],
      denied: [],
      expired: false,
    };
    const msging = this.#messaging;

    const electionTimeoutCallback = () => {
      if (msging) {
        log.debug(
          `sending consensus message: 'VOTEME, ${JSON.stringify(
            myState
          )}, ${JSON.stringify(electionState)}`
        );
        msging.sendToRoom(
          'consensus',
          'consensus',
          'election',
          'VOTEME',
          myState,
          electionState
        );
      }
    };

    if (this.#electionTimeout) {
      clearInterval(this.#electionTimeout);
    }
    const timeoutLength =
      Math.random() * (CONSENSUS_ELMAX - CONSENSUS_ELMIN) + CONSENSUS_ELMIN;
    log.debug(`starting election timeout with length ${timeoutLength}`);
    this.#electionTimeout = setTimeout(electionTimeoutCallback, timeoutLength);
  }

  #handleElection(
    messageType: ElectionMessageType,
    nodeState: NodeState,
    electionState: ElectionState
  ) {
    const { candidate } = electionState;

    if (nodeState.term > this.#term) {
      if (messageType === 'VOTEME') {
        this.#sendElection('OK', this.getSimpleState(), {
          ...electionState,
          votes: [...electionState.votes, HOST],
        });
      }
      this.#term = nodeState.term;
      this.#status = 'FOLLOWER';
      this.#electionState[candidate] = {
        ...electionState,
        expired: true,
      };
    }

    switch (messageType) {
      case 'VOTEME':
        // send OK, if not already voted and not the leader of this term
        if (!electionState.votes.includes(HOST) && this.#status !== 'LEADER') {
          this.#electionState[candidate] = {
            ...electionState,
            votes: [...electionState.votes, HOST],
          };
          this.#sendElection(
            'OK',
            this.getSimpleState(),
            this.#electionState[candidate]
          );
        }
        break;
      case 'OK':
        // pass, if this election is not active
        if (electionState.term < this.#term) {
          break;
        }

        // add vote to the local state
        this.#electionState[candidate] = { ...electionState };

        // send LEADER, if this node is the candidate and there are enough votes
        if (
          candidate === HOST &&
          electionState.votes.length > Math.ceil(this.#nodes.length / 2)
        ) {
          this.#status = 'LEADER';
          const myState = this.getSimpleState();
          this.#sendElection('LEADER', myState, this.#electionState[candidate]);
          this.#leader = myState;
          log.info(
            `this node is the new leader:\n\t${JSON.stringify(
              electionState
            )},\n\t${JSON.stringify(myState)}`
          );
        }
        break;
      case 'LEADER':
        // pass if this election is not active or the sender is already the leader
        if (
          electionState.term < this.#term ||
          nodeState.address === this.#leader?.address
        ) {
          break;
        }
        // follow the leader
        this.#status = 'FOLLOWER';
        this.#term = nodeState.term;
        this.#leader = nodeState;
        log.info(
          `${nodeState.address} declared itself as a leader (${JSON.stringify(
            electionState
          )})`
        );
        break;
      case 'DENIED':
        // pass if this election is not active
        if (electionState.term < this.#term) {
          break;
        }
        // add denial to the local state
        this.#electionState[candidate] = { ...electionState };
        break;
      default:
        throw new Error('ran out of options');
    }
  }

  #sendElection(
    messageType: ElectionMessageType,
    nodeState: NodeState,
    electionState: ElectionState | null
  ) {
    if (!electionState) {
      throw new Error('no election state');
    }
    log.debug(
      `sending consensus message: ${messageType}, ${JSON.stringify(
        nodeState
      )}, ${JSON.stringify(electionState)}`
    );
    this.#messaging?.sendToRoom(
      'consensus',
      'consensus',
      'election',
      messageType,
      nodeState,
      electionState
    );
  }

  getSimpleState(): NodeState {
    return {
      address: HOST,
      status: this.#status,
      term: this.#term,
    };
  }

  getFullState(): NodeState {
    return {
      address: HOST,
      status: this.#status,
      term: this.#term,
      nodes: this.#nodes,
    };
  }
}
