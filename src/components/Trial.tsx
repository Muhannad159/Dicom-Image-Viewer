import { useEffect, useRef, useState } from "react";
import dicomParser from "dicom-parser";
import { init as coreInit, RenderingEngine, Enums } from "@cornerstonejs/core";
import {
  init as dicomImageLoaderInit,
  wadouri,
} from "@cornerstonejs/dicom-image-loader";
import {
  init as cornerstoneToolsInit,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
  Enums as csToolsEnums,
  addTool,
} from "@cornerstonejs/tools";
const { ViewportType } = Enums;

const Trial = () => {
  const [loading, setLoading] = useState(true);
  const [imageIds, setImageIds] = useState([]);
  const renderingEngineId = "myRenderingEngine";
  const renderingEngineRef = useRef(null);
  const viewportRef = useRef(null);
  const initializedRef = useRef(false);
  const viewportId = "myViewport";
  const toolGroupId = "myToolGroup";

  useEffect(() => {
    const initCornerstone = async () => {
      if (initializedRef.current) {
        return;
      }
      initializedRef.current = true;
      // Initialize Cornerstone3D and tools
      await coreInit();
      await cornerstoneToolsInit();
      await dicomImageLoaderInit();

      // Add tools
      addTool(WindowLevelTool);
      addTool(ZoomTool);
      const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
      if (!toolGroup) {
        console.error("Failed to create tool group:", toolGroupId);
        return;
      }
      toolGroup.addTool(WindowLevelTool.toolName);
      toolGroup.addTool(ZoomTool.toolName);
      toolGroup.setToolActive(WindowLevelTool.toolName, {
        bindings: [
          {
            mouseButton: csToolsEnums.MouseBindings.Primary, // Left Click
          },
        ],
      });
      toolGroup.setToolActive(ZoomTool.toolName, {
        bindings: [
          {
            mouseButton: csToolsEnums.MouseBindings.Secondary, // Right Click
          },
        ],
      });

      // Initialize rendering engine
      const renderingEngine = new RenderingEngine(renderingEngineId);
      renderingEngineRef.current = renderingEngine;
      const viewportElement = viewportRef.current;
      viewportElement.style.width = "500px";
      viewportElement.style.height = "500px";

      // Set up viewport
      toolGroup.addViewport(viewportId, renderingEngineId);

      renderingEngine.enableElement({
        viewportId,
        type: ViewportType.STACK,
        element: viewportElement,
        defaultOptions: {},
      });

      setLoading(false);
    };

    initCornerstone();
  }, []);

  useEffect(() => {
    if (imageIds.length > 0 && renderingEngineRef.current) {
      const renderingEngine = renderingEngineRef.current;
      const viewport = renderingEngine.getViewport(viewportId);
      viewport.setStack(imageIds);
      viewport.render();
    }
  }, [imageIds]);

  const handleFileUpload = async (files) => {
    const newImageIds = [];
    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const byteArray = new Uint8Array(arrayBuffer);
        const dataset = dicomParser.parseDicom(byteArray);
        const sopInstanceUID = dataset.string("x00080018"); // SOP Instance UID
        const imageId = wadouri.fileManager.add(file);
        newImageIds.push(imageId);
      } catch (error) {
        console.error("Error processing file:", file.name, error);
      }
    }
    setImageIds(newImageIds);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files);
    }
  };
  const handleFileInput = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleFileUpload(files);
    }
  };
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      style={{
        padding: "20px",
        border: "2px dashed #ccc",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {loading && <p>Loading Cornerstone...</p>}
      <input
        type="file"
        accept=".dcm,image/dicom"
        multiple
        onChange={handleFileInput}
        style={{ marginBottom: "10px" }}
      />
      <p>Drag and drop DICOM files here or click to upload.</p>
      <div ref={viewportRef} style={{ width: "100%", height: "500px" }} />
    </div>
  );
};
export default Trial;
