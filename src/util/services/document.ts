import axios from 'axios';
import { Document, isDocument } from '../../../server/types';

const baseUrl = '/api/documents';

async function getAll() {
  const { data } = await axios.get<Document[]>(baseUrl);
  return data;
}

const createDocument = (newDocumentName: string) => {
  console.log(`creating new document ${newDocumentName}`);
  const request = axios.post(baseUrl, { documentName: newDocumentName });
  return request.then((response) => {
    if (response.data && isDocument(response.data)) {
      return response.data;
    }
    return null;
  });
};

const documentService = {
  getAll,
  createDocument,
};

export default documentService;
