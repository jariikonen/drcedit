/* eslint-disable import/extensions */
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import logger from '../utils/logger';
import { File, isFile } from '../types';
import { STORAGE_DIR, STORAGE_FILES_PATH } from '../utils/config';

const log = logger.child({ caller: 'Storage' });

export default class Storage extends EventEmitter {
  #files: File[] = [];

  #initialized = false;

  constructor() {
    super();
    let files: File[] = [];
    try {
      const data = fs.readFileSync(STORAGE_FILES_PATH, 'utf-8');
      files = Storage.#parseFileData(data);
    } catch (error: unknown) {
      if (Storage.#isNodeError(error) && error.code === 'ENOENT') {
        Storage.#createStorageDir();
      }
      if (error instanceof Error) log.error(error.stack);
      else log.error(error);
    }
    this.#files = files;
    this.#initialized = true;
    log.debug(this.#files, 'Storage initialized - found these files:');
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

  static #parseFileData(data: string): File[] {
    const array: unknown = JSON.parse(data);
    if (!Array.isArray(array)) {
      throw new Error('not an array');
    }
    const parsedArray = array.map((file) => {
      if (!isFile(file)) {
        throw new Error(`not a File object: '${JSON.stringify(file)}'`);
      }
      return file;
    });
    return parsedArray;
  }

  getFiles() {
    if (!this.#initialized) {
      return this.#waitUntilInitialized<File[]>(() => this.#files);
    }
    return new Promise((resolve) => {
      resolve(this.#files);
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

  createFile(filename: string) {
    const newFile = {
      filename,
      content: null,
    };
    const callback = () => {
      this.#files.push(newFile);
      this.#writeFiles();
      return newFile;
    };
    if (!this.#initialized) {
      return this.#waitUntilInitialized<File>(callback);
    }
    return new Promise((resolve) => {
      resolve(callback());
    });
  }

  #writeFiles() {
    fs.writeFileSync(STORAGE_FILES_PATH, JSON.stringify(this.#files), 'utf-8');
  }
}
