import { TextField, TextFieldVariants } from '@mui/material';

interface NonEmptyInputProps {
  label: string;
  errorStr: string;
  errorValue: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setValue: React.Dispatch<React.SetStateAction<string | null>>;
  variant?: TextFieldVariants;
  autoFocus?: boolean;
}

function NonEmptyInput({
  label,
  errorStr,
  errorValue,
  setError,
  setValue,
  variant,
  autoFocus,
}: NonEmptyInputProps) {
  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setValue(e.target.value);

    if (e.target.value.length > 0) {
      setError(null);
    } else {
      setError(errorStr);
      setValue(null);
    }
  }

  return (
    <TextField
      autoFocus={autoFocus}
      margin="none"
      error={errorValue !== null}
      label={label}
      variant={variant}
      onChange={(e) => handleChange(e)}
      helperText={errorValue}
    />
  );
}

NonEmptyInput.defaultProps = {
  variant: 'standard',
  autoFocus: false,
};

export default NonEmptyInput;
