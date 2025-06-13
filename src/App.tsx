import React, { useState } from "react";
import FileUpload from "./components/FileUpload";
import Viewer from "./components/Viewer";

function App() {
  const [files, setFiles] = useState<File[]>([]);

  return (
    <div className="h-screen w-screen overflow-hidden">
      {files.length === 0 ? (
        <FileUpload setFiles={setFiles} />
      ) : (
        <Viewer files={files} />
      )}
    </div>
  );
}

export default App;
