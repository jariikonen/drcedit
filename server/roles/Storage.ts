/* eslint-disable import/extensions */
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import logger from '../utils/logger';
import { File } from '../types';
import { STORAGE_DIR, STORAGE_FILES_PATH } from '../utils/config';

const log = logger.child({ caller: 'Storage' });

export default class Storage extends EventEmitter {
  #files: File[] = [];

  #initialized = false;

  constructor() {
    super();
    fs.readFile(STORAGE_FILES_PATH, 'utf-8', (err, data) => {
      if (err && err.code !== 'ENOENT')
        log.error(err, 'constructor, fs-callback:');
      if (err) Storage.#createStorageDir();
      if (data) {
        try {
          this.#files = Storage.#parseFileData(data);
          this.#initialized = true;
          log.info(
            `Storage initialized - found these files: ${JSON.stringify(
              this.#files
            )}`
          );
        } catch (error) {
          log.error(error, 'not a valid File object');
        }
      }
    });
  }

  static #createStorageDir() {
    fs.mkdir(STORAGE_DIR, (err) => {
      if (err && err.code !== 'EEXIST') throw err;
    });
  }

  static #parseFileData(data: string): File[] {
    const array: unknown = JSON.parse(data);
    if (!Array.isArray(array)) {
      throw new Error('not an array');
    }
    const parsedArray = array.map((file) => {
      if (!Storage.#isFileObject(file)) {
        throw new Error('not a File object');
      }
      log.info(`file object: ${JSON.stringify(file)}`);
      return file;
    });
    return parsedArray;
  }

  static #isFileObject(obj: unknown): obj is File {
    // NOTICE! For simplicity, property types (especially Y.Doc) are NOT tested!
    return (
      (obj as File).content !== undefined && (obj as File).name !== undefined
    );
  }

  getFiles() {
    if (!this.#initialized) {
      return null;
    }
    return this.#files;
  }
}
