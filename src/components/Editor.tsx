import { useState, useRef, useEffect } from 'react';
import ReactQuill, { Quill, ReactQuillProps } from 'react-quill';
import QuillCursors from 'quill-cursors';
import 'react-quill/dist/quill.snow.css';
import * as Y from 'yjs';
import { io, Socket } from 'socket.io-client';
import Typography from '@mui/material/Typography';
import DocumentList from './DocumentList';
import { EditingServerData } from '../../server/types';
import { ServerResponse } from '../../server/services/Editing';
import { SOCKETIO_PORT } from '../../server/utils/config';

Quill.register('modules/cursors', QuillCursors);

function Editor() {
  const [editingServerData, setEditingServerData] =
    useState<EditingServerData | null>(null);

  const editorRef = useRef<ReactQuill | null>(null);
  const editorInitRef = useRef<boolean>(false);
  const serverDataRef = useRef<EditingServerData | null>(null);

  const yDocRef = useRef<Y.Doc>(new Y.Doc());
  const yTextRef = useRef<Y.Text>(yDocRef.current.getText());
  const yDocInitRef = useRef<boolean>(false);

  const updateCountRef = useRef<number>(0);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const [editorValue, setEditorValue] = useState(yTextRef.current.toDelta());

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // set focus to the Quill-editor component when component is rendered
    if (editorRef.current && editorInitRef.current === false) {
      console.log('setting focus to editor');
      editorInitRef.current = true;
      editorRef.current.focus();
    }
  });

  /** Adds listeners to a Socket.io socket. */
  function initSocketIO(socket: Socket) {
    socket.on('connect', () => {
      console.log(`connected with socket.id '${socket.id}'`);
    });

    socket.on(
      'update',
      (update: Uint8Array, count: number, clientID: number) => {
        // apply update to the document state and set new editor value
        console.log(`received an update '${count}' from '${clientID}'`);
        Y.applyUpdate(yDocRef.current, new Uint8Array(update), 'outside');
        setEditorValue(yTextRef.current.toDelta());
        console.log(`current document state: ${yTextRef.current.toJSON()}`);
      }
    );
  }

  useEffect(() => {
    function registrationCallback(response: ServerResponse) {
      // apply the initial content update to current document state object
      if (!response.documentContent) {
        throw new Error(
          `no document content in server response: ${JSON.stringify(response)}`
        );
      }
      const update = new Uint8Array(response.documentContent);
      Y.applyUpdate(yDocRef.current, update, 'init');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const editorValueUpdate = yTextRef.current.toDelta();
      setEditorValue(editorValueUpdate);
    }

    // connect to the editing server
    if (!editingServerData) return;
    serverDataRef.current = editingServerData;
    socketRef.current = io(
      `ws://${editingServerData.contactNode}:${SOCKETIO_PORT}`,
      {}
    );
    initSocketIO(socketRef.current);

    // and register to edit the selected document
    console.log(
      `registering to edit document '${editingServerData.documentID}'`
    );
    socketRef.current.emit(
      'register',
      editingServerData.documentID,
      registrationCallback
    );
  }, [editingServerData]);

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

  if (!yDocInitRef.current) {
    yDocRef.current.on(
      'update',
      (update: Uint8Array, origin: string, doc: Y.Doc) => {
        if (origin !== 'init' && origin !== 'outside') {
          const serverData = serverDataRef.current;
          if (!serverData) throw new Error('no editing server data');
          console.log(
            `sending update '${updateCountRef.current}', clientID: ${
              doc.clientID
            }, documentID: ${
              serverData.documentID
            }, ${yTextRef.current.toJSON()}`
          );
          socketRef.current?.emit(
            'update',
            update,
            updateCountRef.current,
            doc.clientID,
            serverData.documentID
          );
          updateCountRef.current += 1;
        }
      }
    );

    yDocInitRef.current = true;
  }

  const handleContentChange: ReactQuillProps['onChange'] = (
    _content,
    delta,
    source,
    editor
  ) => {
    if (source === 'user') {
      yTextRef.current.applyDelta(delta.ops);
      setEditorValue(editor.getContents());
    }
  };

  if (!editingServerData) {
    return <DocumentList setEditingServerData={setEditingServerData} />;
  }
  return (
    <>
      <Typography align="left" variant="h5" style={{ marginBottom: '1rem' }}>
        Document: {editingServerData.documentName}
      </Typography>
      <ReactQuill
        ref={editorRef}
        theme="snow"
        modules={modules}
        formats={formats}
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        value={editorValue}
        onChange={handleContentChange}
        // eslint-disable-next-line jsx-a11y/tabindex-no-positive
        tabIndex={1}
      />
    </>
  );
}

export default Editor;
