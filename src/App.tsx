import React, { useState, useEffect } from "react";
import { init as coreInit, registerImageLoader } from "@cornerstonejs/core";
import {
  init as dicomImageLoaderInit,
  wadouri,
} from "@cornerstonejs/dicom-image-loader";
import { init as cornerstoneToolsInit } from "@cornerstonejs/tools";
import FileUpload from "./components/FileUpload";
import Viewer from "./components/Viewer";

function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    const initCornerstone = async () => {
      try {
        coreInit();
        dicomImageLoaderInit();
        cornerstoneToolsInit();
        console.log("Cornerstone3D, WADO-URI loader, and tools initialized");
        setIsInitialized(true);
      } catch (error) {
        console.error("Failed to initialize:", error);
      }
    };

    initCornerstone();
  }, []);

  if (!isInitialized) {
    return <div>Loading...</div>;
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b px-6 py-4">
        <h1 className="text-2xl font-semibold">DICOM Viewer</h1>
      </header>
      <main className="flex-1">
        {files.length === 0 ? (
          <FileUpload onFilesSelected={setFiles} />
        ) : (
          <Viewer files={files} />
        )}
      </main>
    </div>
  );
}

export default App;
