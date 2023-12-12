import { useState, useRef, useEffect } from 'react';
import ReactQuill, { Quill, ReactQuillProps } from 'react-quill';
import QuillCursors from 'quill-cursors';
import 'react-quill/dist/quill.snow.css';
import * as Y from 'yjs';
import { Socket } from 'socket.io-client';
import Typography from '@mui/material/Typography';
import DocumentList from './DocumentList';
import { EditingServerData } from '../../server/types';

Quill.register('modules/cursors', QuillCursors);

function Editor() {
  const [editingServerData, setEditingServerData] =
    useState<EditingServerData | null>(null);

  const ydocRef = useRef(new Y.Doc());
  const ytextRef = useRef(ydocRef.current.getText());
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const [value, setValue] = useState(ytextRef.current.toDelta());
  const socketRef = useRef<Socket | null>(null);
  // const [socketID, setSocketID] = useState<string>();

  useEffect(() => {
    /* socketRef.current = io('ws://localhost:1234', {});
    socketRef.current.onAny((eventName, ...args) => {
      console.log(eventName, args);
    });
    socketRef.current.emit(
      'register',
      'dokumentin ID',
      'dokumentin nimi',
      'Pertti'
    );
    socketRef.current.on('connect', () => {
      if (socketRef?.current?.id !== undefined) {
        // setSocketID(socketRef.current.id);
        console.log(socketRef.current.id);
        socketRef.current.on(socketRef.current.id, (message: string) => {
          console.log(message);
        });
      }
    }); */
  }, []);

  const modules = {
    toolbar: [
      [{ header: [1, 2, 3, 4, 5, 6, false] }],
      ['bold', 'italic', 'underline', 'strike', 'blockquote'],
      [{ font: [] }],
      [{ align: ['', 'center', 'right', 'justify'] }],
      [{ list: 'ordered' }, { list: 'bullet' }],
    ],
    cursors: {
      template: '<div class="custom-cursor">...</div>',
      hideDelayMs: 5000,
      hideSpeedMs: 0,
      selectionChangeSource: null,
      transformOnTextChange: true,
    },
    history: {
      // Local undo shouldn't undo changes from remote users
      userOnly: true,
    },
  };

  const formats = [
    'header',
    'bold',
    'italic',
    'underline',
    'strike',
    'blockquote',
    'bullet',
    'font',
    'align',
    'list',
  ];

  const handleContentChange: ReactQuillProps['onChange'] = (
    _content,
    delta,
    _source,
    editor
  ) => {
    ytextRef.current.applyDelta(delta.ops);
    setValue(editor.getContents());
    console.log(ytextRef.current.toJSON());
  };

  ydocRef.current.on(
    'update',
    (update: Uint8Array, origin: string, doc: Y.Doc) => {
      console.log(origin, doc.clientID);
      socketRef.current?.emit('update', update, doc.clientID);
    }
  );

  if (!editingServerData) {
    return <DocumentList setEditingServerData={setEditingServerData} />;
  }
  return (
    <>
      <Typography align="left" variant="h5" style={{ marginBottom: '1rem' }}>
        Document: {editingServerData.documentName}
      </Typography>
      <ReactQuill
        theme="snow"
        modules={modules}
        formats={formats}
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        value={value}
        onChange={handleContentChange}
        // eslint-disable-next-line jsx-a11y/tabindex-no-positive
        tabIndex={1}
      />
    </>
  );
}

export default Editor;
