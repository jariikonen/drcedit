import axios from 'axios';
import {
  EditingServerData,
  isEditingServerData,
  Document,
} from '../../../server/types';

const baseUrl = '/api/documents';

async function getAll() {
  const { data } = await axios.get<Document[]>(baseUrl);
  return data;
}

function createDocument(
  newDocumentName: string
): Promise<EditingServerData | null> {
  const promise = axios.post(baseUrl, { documentName: newDocumentName });
  return promise.then((response) => {
    if (response.data && isEditingServerData(response.data)) {
      return response.data;
    }
    return null;
  });
}

async function editDocument(
  documentID: string
): Promise<EditingServerData | null> {
  const { data } = await axios.get<EditingServerData | null>(
    `${baseUrl}/edit/${documentID}`
  );
  return data;
}

const documentService = {
  getAll,
  createDocument,
  editDocument,
};

export default documentService;
