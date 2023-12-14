import { useState } from 'react';
import { Box } from '@mui/material';
import NonEmptyInput from './NonEmptyInput';

interface NameScreenProps {
  setName: React.Dispatch<React.SetStateAction<string | null>>;
}

function NameScreen({ setName }: NameScreenProps) {
  const [nameValue, setNameValue] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameErrorStr = 'name must not be empty';

  function handleSubmit(e: React.SyntheticEvent) {
    if (nameValue) {
      setName(nameValue);
    } else {
      setNameError(nameErrorStr);
    }
    e.preventDefault();
  }

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
    >
      <form onSubmit={(e) => handleSubmit(e)}>
        <NonEmptyInput
          label="Your name, please"
          errorStr={nameErrorStr}
          errorValue={nameError}
          setError={setNameError}
          setValue={setNameValue}
        />
      </form>
    </Box>
  );
}

export default NameScreen;
