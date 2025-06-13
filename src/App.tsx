import React, { useState } from "react";
import FileUpload from "./components/FileUpload";
import Viewer from "./components/Viewer";

function App() {
  const [fileData, setFileData] = useState<
    | {
        files: File[];
        uploadType: "single" | "multiple" | "series" | "study";
        seriesGroups: Map<string, File[]>;
      }
    | undefined
  >(undefined);

  return (
    <div className="h-screen">
      {fileData ? (
        <Viewer fileData={fileData} />
      ) : (
        <FileUpload
          setFiles={(data) => {
            setFileData(data);
          }}
        />
      )}
    </div>
  );
}

export default App;
