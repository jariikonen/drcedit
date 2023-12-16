import { EventEmitter } from 'node:events';
// import * as Y from 'yjs';
import logger from '../../utils/logger';
import { HOST } from '../../utils/networkinfo';
import Messaging from '../Messaging';
import Storage from '../Storage';
import Discovery from '../Discovery';

export type NodeStatus = 'FOLLOWER' | 'CANDIDATE' | 'LEADER';

export interface NodeState {
  status: NodeStatus;
  term: number;
  nodes?: string[];
}

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
  #nodeStatus: NodeStatus = 'FOLLOWER';

  #term = 0;

  #electionTimeoutLength: number;

  #electionInterval: NodeJS.Timeout | null = null;

  #nodes: string[];

  /** Local Storage service instance. */
  #storage: Storage;

  /** Local Messaging service instance. */
  #messaging: Messaging | null;

  #discovery: Discovery;

  constructor(
    messaging: Messaging | null,
    storage: Storage,
    discovery: Discovery
  ) {
    super();
    this.#storage = storage;
    this.#messaging = messaging;
    this.#discovery = discovery;
    this.#electionTimeoutLength = Math.random() * 150 + 150;
    this.#nodes = discovery.getNodeAddresses();

    if (this.#messaging) {
      this.#initializeMessaging();
      this.#startLeaderElection();
      log.info(
        `Consensus starting with electionTimeoutLength = ${
          this.#electionTimeoutLength
        }`
      );
    } else {
      log.info('Consensus started without messaging service');
    }
    log.debug(this.#electionInterval); // JUST TO SUPPRESS ESLINT - REMOVE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    log.debug(this.#storage); // JUST TO SUPPRESS ESLINT - REMOVE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    log.debug(this.#discovery); // JUST TO SUPPRESS ESLINT - REMOVE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  }

  #initializeMessaging() {
    if (!this.#messaging) throw new Error('no messaging service');
    if (!this.#messaging.isBroker()) this.#messaging.join('consensus');

    this.#messaging.on('consensus', (subEvent: string, ...args: unknown[]) => {
      log.info(
        `received a consensua message with sub-event '${subEvent}':\n\t'${JSON.stringify(
          args
        )}'`
      );
    });
  }

  #startLeaderElection() {
    const msging = this.#messaging;
    function electionTimeoutCallback() {
      if (msging) {
        msging.sendToRoom('consensus', 'consensus', `testi ${HOST}`);
      }
    }

    this.#electionInterval = setTimeout(
      electionTimeoutCallback,
      this.#electionTimeoutLength
    );
  }

  getState() {
    return {
      status: this.#nodeStatus,
      term: this.#term,
      nodes: this.#nodes,
    };
  }

  /* commitUpdate(update: Uint8Array, documentStateRef: Y.Doc) {

  } */
}
