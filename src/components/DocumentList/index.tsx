/* eslint-disable jsx-a11y/anchor-is-valid */
import { useEffect, useState } from 'react';
import {
  Box,
  Grid,
  Typography,
  Table,
  TableBody,
  TableRow,
  Link,
} from '@mui/material';
import { EditingServerData, Document } from '../../../server/types';
import DocumentNameInput from './DocumentNameInput';
import documentService from '../../util/services/document';

interface DocumentListProps {
  setEditingServerData: React.Dispatch<
    React.SetStateAction<EditingServerData | null>
  >;
}

function DocumentList({ setEditingServerData }: DocumentListProps) {
  const [documentList, setDocumentList] = useState<Document[]>([]);
  const [newDocumentName, setNewDocumentName] = useState<string | null>(null);

  useEffect(() => {
    const fetchDocuments = async () => {
      const documents: Document[] = await documentService.getAll();
      setDocumentList(documents);
    };
    // eslint-disable-next-line no-void
    void fetchDocuments();
  }, []);

  useEffect(() => {
    const createDocument = async (documentName: string) => {
      console.log(
        `requesting the server to create a new document '${documentName}'`
      );
      const serverData = await documentService.createDocument(documentName);
      if (!serverData) {
        throw new Error('invalid response from server - no serverData');
      }
      console.log('server responded with editing server data:', serverData);
      setEditingServerData(serverData);
    };
    if (newDocumentName) {
      // eslint-disable-next-line no-void
      void createDocument(newDocumentName);
    }
  }, [newDocumentName, setEditingServerData]);

  function handleLinkClick(documentName: string) {
    console.log(
      `requesting the document '${documentName}' to be prepared for editing`
    );
    let serverData;
    async function fetchServerData() {
      serverData = await documentService.editDocument(documentName);
      if (!serverData) {
        throw new Error('invalid response from server - no serverData');
      }
      console.log('server responded with editing server data:', serverData);
      setEditingServerData(serverData);
    }
    // eslint-disable-next-line no-void
    void fetchServerData();
  }

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="70vh"
    >
      <Grid
        container
        rowSpacing={{ xs: 1 }}
        columnSpacing={{ xs: 0.7 }}
        maxWidth="50vw"
      >
        {documentList.length > 0 ? (
          <Grid item xs={12}>
            <Typography
              align="left"
              variant="h5"
              style={{ marginBottom: '1rem' }}
            >
              Select a document to edit
            </Typography>
            <Table style={{ marginBottom: '1rem' }}>
              <TableBody>
                {Object.values(documentList).map((document) => (
                  <TableRow key={document.documentID}>
                    <Link
                      component="button"
                      variant="body2"
                      onClick={() => handleLinkClick(document.documentID)}
                    >
                      {document.documentName}
                    </Link>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Grid>
        ) : (
          <Grid item xs={12}>
            <Typography
              align="left"
              variant="h5"
              style={{ marginBottom: '1rem' }}
            >
              There are currently no documents
            </Typography>
          </Grid>
        )}
        <Grid item xs={12}>
          <DocumentNameInput setDocumentName={setNewDocumentName} />
        </Grid>
      </Grid>
    </Box>
  );
}

export default DocumentList;
