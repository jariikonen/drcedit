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
import { File } from '../../../server/types';
import FilenameInput from './FilenameInput';
import fileService from '../../util/services/file';

interface FileListProps {
  setFile: React.Dispatch<React.SetStateAction<File | null>>;
}

function FileList({ setFile }: FileListProps) {
  const [fileList, setFileList] = useState<File[]>([]);
  const [newFileName, setNewFileName] = useState<string | null>(null);

  useEffect(() => {
    const fetchFiles = async () => {
      const files = await fileService.getAll();
      setFileList(files);
    };
    // eslint-disable-next-line no-void
    void fetchFiles();
  }, []);

  useEffect(() => {
    const createFile = async (filename: string) => {
      const file = await fileService.createFile(filename);
      if (!file) {
        throw new Error('invalid response from server');
      }
      console.log('server responded with a new file object:', file);
      setFile(file);
    };
    if (newFileName) {
      // eslint-disable-next-line no-void
      void createFile(newFileName);
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
        {fileList.length > 0 ? (
          <Grid item xs={12}>
            <Typography
              align="left"
              variant="h5"
              style={{ marginBottom: '1rem' }}
            >
              Select a file to edit
            </Typography>
            <Table style={{ marginBottom: '1rem' }}>
              <TableBody>
                {Object.values(fileList).map((file: File) => (
                  <TableRow>
                    <Link
                      component="button"
                      variant="body2"
                      onClick={() => setFile(file)}
                    >
                      {file.filename}
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
              There are currently no files
            </Typography>
          </Grid>
        )}
        <Grid item xs={12}>
          <FilenameInput setFilename={setNewFileName} />
        </Grid>
      </Grid>
    </Box>
  );
}

export default FileList;
