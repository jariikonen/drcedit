/* eslint-disable import/extensions */
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import logger from '../utils/logger';
import { Document, isDocument } from '../types';
import { STORAGE_DIR, STORAGE_DOCUMENTS_PATH } from '../utils/config';
import Messaging from './Messaging';

const log = logger.child({ caller: 'Storage' });

export default class Storage extends EventEmitter {
  #messaging: Messaging | null;

  #documents: Document[] = [];

  #documentIDCount = 0;

  #initialized = false;

  constructor(messaging: Messaging | null) {
    super();
    this.#messaging = messaging;
    let documents: Document[] = [];
    try {
      const data = fs.readFileSync(STORAGE_DOCUMENTS_PATH, 'utf-8');
      documents = Storage.#parseDocumentData(data);
    } catch (error: unknown) {
      if (Storage.#isNodeError(error) && error.code === 'ENOENT') {
        log.debug('no document file - creating a new one');
        Storage.#createStorageDir();
        this.#documents = [];
        this.#writeDocuments();
      } else if (error instanceof Error) {
        log.error(error.stack);
      } else log.error(error);
    }
    this.#documents = documents;
    const maxID =
      Math.max(...documents.map((doc) => parseInt(doc.documentID, 10))) + 1;
    this.#documentIDCount = maxID > 0 ? maxID : 0;
    this.#initialized = true;
    log.info(this.#documents, 'storage initialized');
    log.debug(this.#documents, 'found these documents:');
    log.debug(this.#messaging); // TO SUPPRESS ESLINT ERROR!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  }

  static #isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return (
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code !== undefined
    );
  }

  static #createStorageDir() {
    try {
      fs.mkdirSync(STORAGE_DIR);
    } catch (error) {
      if (Storage.#isNodeError(error) && error.code !== 'EEXIST')
        log.error(error.stack);
    }
  }

  static #parseDocumentData(data: string): Document[] {
    const array: unknown = JSON.parse(data);
    if (!Array.isArray(array)) {
      throw new Error('not an array');
    }
    const parsedArray = array.map((document) => {
      if (!isDocument(document)) {
        throw new Error(`not a Document object: '${JSON.stringify(document)}'`);
      }
      return document;
    });
    return parsedArray;
  }

  getDocuments(): Promise<Document[]> {
    if (!this.#initialized) {
      return this.#waitUntilInitialized<Document[]>(() => this.#documents);
    }
    return new Promise((resolve) => {
      resolve(this.#documents);
    });
  }

  #waitUntilInitialized<Type>(callback: () => Type): Promise<Type> {
    return new Promise((resolve, reject) => {
      let count = 1;
      const interval = setInterval(() => {
        if (this.#initialized) {
          resolve(callback());
          clearInterval(interval);
        }
        if (count > 4) {
          reject(new Error('storage initialization took too long'));
          clearInterval(interval);
        }
        count += 1;
      }, 100);
    });
  }

  getDocument(documentID: string): Promise<Document | undefined> {
    const callback = () =>
      this.#documents.find((doc) => doc.documentID === documentID);

    if (!this.#initialized) {
      return this.#waitUntilInitialized<Document | undefined>(callback);
    }
    return new Promise((resolve) => {
      resolve(callback());
    });
  }

  createDocument(documentName: string): Promise<Document> {
    const newDocument = {
      documentName,
      documentID: this.#documentIDCount.toString(10),
      content: null,
    };
    this.#documentIDCount += 1;

    const callback = () => {
      this.#documents.push(newDocument);
      this.#writeDocuments();
      return newDocument;
    };

    if (!this.#initialized) {
      return this.#waitUntilInitialized<Document>(callback);
    }
    return new Promise((resolve) => {
      resolve(callback());
    });
  }

  #writeDocuments() {
    fs.writeFileSync(
      STORAGE_DOCUMENTS_PATH,
      JSON.stringify(this.#documents),
      'utf-8'
    );
  }
}
