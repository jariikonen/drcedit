import { useState } from 'react';
import { Button, Grid } from '@mui/material';
import NonEmptyInput from '../NonEmptyInput';

interface FileNameInputProps {
  setFilename: React.Dispatch<React.SetStateAction<string | null>>;
}

function FilenameInput({ setFilename }: FileNameInputProps) {
  const [inputVisible, setInputVisible] = useState(false);

  const [filenameValue, setFilenameValue] = useState<string | null>(null);
  const [filenameError, setFilenameError] = useState<string | null>(null);
  const filenameErrorStr = 'filename must not be empty';

  function handleSubmit(e: React.SyntheticEvent) {
    if (filenameValue) {
      setFilename(filenameValue);
    } else {
      setFilenameError(filenameErrorStr);
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
              label="Filename"
              errorStr={filenameErrorStr}
              errorValue={filenameError}
              setError={setFilenameError}
              setValue={setFilenameValue}
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
      New file
    </Button>
  );
}

export default FilenameInput;
