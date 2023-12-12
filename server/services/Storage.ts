/* eslint-disable import/extensions */
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import logger from '../utils/logger';
import { Document, isDocument } from '../types';
import { STORAGE_DIR, STORAGE_FILES_PATH } from '../utils/config';

const log = logger.child({ caller: 'Storage' });

export default class Storage extends EventEmitter {
  #documents: Document[] = [];

  #initialized = false;

  constructor() {
    super();
    let documents: Document[] = [];
    try {
      const data = fs.readFileSync(STORAGE_FILES_PATH, 'utf-8');
      documents = Storage.#parseDocumentData(data);
    } catch (error: unknown) {
      if (Storage.#isNodeError(error) && error.code === 'ENOENT') {
        Storage.#createStorageDir();
      }
      if (error instanceof Error) log.error(error.stack);
      else log.error(error);
    }
    this.#documents = documents;
    this.#initialized = true;
    log.debug(this.#documents, 'Storage initialized - found these documents:');
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

  getDocuments() {
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
          reject(new Error('initialization took too long'));
          clearInterval(interval);
        }
        count += 1;
      }, 100);
    });
  }

  createDocument(documentName: string) {
    const newDocument = {
      documentName,
      content: null,
    };
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
      STORAGE_FILES_PATH,
      JSON.stringify(this.#documents),
      'utf-8'
    );
  }
}
