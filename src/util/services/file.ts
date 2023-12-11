import axios from 'axios';
import { File, isFile } from '../../../server/types';

const baseUrl = '/api/files';

async function getAll() {
  const { data } = await axios.get<File[]>(baseUrl);
  return data;
}

const createFile = (newFileName: string) => {
  console.log(`creating new file ${newFileName}`);
  const request = axios.post(baseUrl, { filename: newFileName });
  return request.then((response) => {
    if (response.data && isFile(response.data)) {
      return response.data;
    }
    return null;
  });
};

const fileService = {
  getAll,
  createFile,
};

export default fileService;
