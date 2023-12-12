import { useState } from 'react';
import { Button, Grid } from '@mui/material';
import NonEmptyInput from '../NonEmptyInput';

interface DocumentNameInputProps {
  setDocumentName: React.Dispatch<React.SetStateAction<string | null>>;
}

function DocumentNameInput({ setDocumentName }: DocumentNameInputProps) {
  const [inputVisible, setInputVisible] = useState(false);

  const [docNameValue, setDocNameValue] = useState<string | null>(null);
  const [docNameError, setDocNameError] = useState<string | null>(null);
  const docNameErrorStr = 'document name must not be empty';

  function handleSubmit(e: React.SyntheticEvent) {
    if (docNameValue) {
      setDocumentName(docNameValue);
    } else {
      setDocNameError(docNameErrorStr);
    }
    e.preventDefault();
  }

  if (inputVisible) {
    return (
      <form onSubmit={(e) => handleSubmit(e)}>
        <Grid container direction="row" spacing={1}>
          <Grid item>
            <NonEmptyInput
              autoFocus
              label="Document name"
              errorStr={docNameErrorStr}
              errorValue={docNameError}
              setError={setDocNameError}
              setValue={setDocNameValue}
            />
          </Grid>
          <Grid item>
            <Button
              variant="contained"
              type="submit"
              sx={{ mt: '0.5rem', mb: '0.5rem' }}
            >
              Create
            </Button>
          </Grid>
          <Grid item>
            <Button
              variant="contained"
              type="button"
              sx={{ mt: '0.5rem', mb: '0.5rem' }}
              onClick={() => setInputVisible(false)}
            >
              Cancel
            </Button>
          </Grid>
        </Grid>
      </form>
    );
  }
  return (
    <Button
      variant="contained"
      type="submit"
      onClick={() => setInputVisible(true)}
    >
      New document
    </Button>
  );
}

export default DocumentNameInput;
