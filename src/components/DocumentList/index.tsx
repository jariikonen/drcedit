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
import { Document } from '../../../server/types';
import DocumentNameInput from './DocumentNameInput';
import documentService from '../../util/services/document';

interface DocumentListProps {
  setDocument: React.Dispatch<React.SetStateAction<Document | null>>;
}

function DocumentList({ setDocument }: DocumentListProps) {
  const [documentList, setDocumentList] = useState<Document[]>([]);
  const [newDocumentName, setNewDocumentName] = useState<string | null>(null);

  useEffect(() => {
    const fetchDocuments = async () => {
      const documents = await documentService.getAll();
      setDocumentList(documents);
    };
    // eslint-disable-next-line no-void
    void fetchDocuments();
  }, []);

  useEffect(() => {
    const createDocument = async (documentName: string) => {
      const document = await documentService.createDocument(documentName);
      if (!document) {
        throw new Error('invalid response from server');
      }
      console.log('server responded with a new document object:', document);
      setDocument(document);
    };
    if (newDocumentName) {
      // eslint-disable-next-line no-void
      void createDocument(newDocumentName);
    }
  });

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
                {Object.values(documentList).map((document: Document) => (
                  <TableRow>
                    <Link
                      component="button"
                      variant="body2"
                      onClick={() => setDocument(document)}
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
