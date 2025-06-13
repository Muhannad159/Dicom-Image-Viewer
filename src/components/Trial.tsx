import React, { useRef, useEffect, useState } from "react";
import {
  Upload,
  FileImage,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";

const Trial = () => {
  const viewportRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState("");
  const renderingEngineRef = useRef(null);
  const cornerstoneRef = useRef({
    RenderingEngine: null,
    Enums: null,
    coreInit: null,
    dicomImageLoaderInit: null,
    cornerstoneToolsInit: null,
    registerImageLoader: null,
    wadouri: null,
  });

  // Initialize Cornerstone with better error handling
  useEffect(() => {
    const initializeCornerstone = async () => {
      setLoadingProgress("Loading Cornerstone libraries...");

      try {
        // Dynamically import Cornerstone modules
        const [coreModule, dicomImageLoaderModule, toolsModule] =
          await Promise.all([
            import("@cornerstonejs/core").catch(() => null),
            import("@cornerstonejs/dicom-image-loader").catch(() => null),
            import("@cornerstonejs/tools").catch(() => null),
          ]);

        if (!coreModule || !dicomImageLoaderModule || !toolsModule) {
          throw new Error(
            "Failed to load Cornerstone.js libraries. Make sure they are properly installed."
          );
        }

        // Store references
        cornerstoneRef.current = {
          RenderingEngine: coreModule.RenderingEngine,
          Enums: coreModule.Enums,
          coreInit: coreModule.init,
          dicomImageLoaderInit: dicomImageLoaderModule.init,
          cornerstoneToolsInit: toolsModule.init,
          registerImageLoader: coreModule.registerImageLoader,
          wadouri: dicomImageLoaderModule.wadouri,
        };

        setLoadingProgress("Initializing Cornerstone core...");
        await cornerstoneRef.current.coreInit();

        setLoadingProgress("Initializing DICOM image loader...");
        await cornerstoneRef.current.dicomImageLoaderInit({
          maxWebWorkers: Math.min(navigator.hardwareConcurrency || 1, 4),
          startWebWorkersOnDemand: true,
          taskConfiguration: {
            decodeTask: {
              initializeCodecsOnStartup: false,
              strict: false,
              options: {
                // Add options for better compatibility
                useRGBA: false,
              },
            },
          },
          webWorkerTaskPaths: [],
          codec: {
            // Configure codecs for better compatibility
          },
        });

        // Register the wadouri image loader
        cornerstoneRef.current.registerImageLoader(
          "wadouri",
          cornerstoneRef.current.wadouri.loadImage
        );

        setLoadingProgress("Initializing Cornerstone tools...");
        await cornerstoneRef.current.cornerstoneToolsInit();

        console.log("Cornerstone initialized successfully");
        setIsInitialized(true);
        setLoadingProgress("");
      } catch (err) {
        console.error("Initialization error:", err);
        setError(`Initialization failed: ${err.message}`);
        setLoadingProgress("");
      }
    };

    initializeCornerstone();
  }, []);

  const validateDicomFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const arrayBuffer = e.target.result;
        const uint8Array = new Uint8Array(
          arrayBuffer,
          0,
          Math.min(256, arrayBuffer.byteLength)
        );

        // Check for DICOM magic number "DICM" at offset 128
        let isDicom = false;
        if (arrayBuffer.byteLength > 132) {
          const dicmCheck = new Uint8Array(arrayBuffer, 128, 4);
          const dicmString = String.fromCharCode(...dicmCheck);
          isDicom = dicmString === "DICM";
        }

        // Also check for common DICOM patterns in the first 256 bytes
        const dataString = String.fromCharCode(...uint8Array);
        const hasTransferSyntax = dataString.includes("1.2.840");
        const hasPatientName =
          uint8Array.includes(0x10) && uint8Array.includes(0x10);

        resolve({
          isDicom: isDicom || hasTransferSyntax || hasPatientName,
          size: arrayBuffer.byteLength,
          hasValidHeader: isDicom,
        });
      };
      reader.onerror = () => reject(new Error("Could not read file"));
      reader.readAsArrayBuffer(file.slice(0, 1024)); // Read first 1KB for validation
    });
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);
    setUploadedFile(file);
    setLoadingProgress("Validating DICOM file...");

    try {
      // Validate the file first
      const validation = await validateDicomFile(file);
      console.log("File validation result:", validation);

      if (!validation.isDicom) {
        throw new Error(
          "File does not appear to be a valid DICOM file. Please check the file format."
        );
      }

      if (validation.size > 50 * 1024 * 1024) {
        // 50MB limit
        throw new Error(
          "File is too large (>50MB). Please try a smaller DICOM file."
        );
      }

      setLoadingProgress("Creating file URL...");

      // Create a URL for the uploaded file
      const fileUrl = URL.createObjectURL(file);

      // Create imageId for the DICOM file
      const imageId = `wadouri:${fileUrl}`;

      console.log("Created imageId:", imageId);
      console.log("File size:", file.size, "bytes");
      console.log("File type:", file.type);

      await renderDicomFile([imageId]);
    } catch (err) {
      console.error("File upload error:", err);
      setError(`Failed to load DICOM file: ${err.message}`);
    } finally {
      setIsLoading(false);
      setLoadingProgress("");
    }
  };

  const renderDicomFile = async (imageIds) => {
    if (!isInitialized || !viewportRef.current) {
      throw new Error("Viewer not initialized or viewport missing");
    }

    if (!cornerstoneRef.current.RenderingEngine) {
      throw new Error("Cornerstone libraries not loaded");
    }

    try {
      setLoadingProgress("Preparing viewport...");
      console.log("Starting render with imageIds:", imageIds);

      // Clean up existing rendering engine
      if (renderingEngineRef.current) {
        try {
          renderingEngineRef.current.destroy();
          console.log("Previous rendering engine destroyed");
        } catch (destroyErr) {
          console.warn("Error destroying previous engine:", destroyErr);
        }
      }

      const renderingEngineId = `dicomViewerEngine_${Date.now()}`;
      const renderingEngine = new cornerstoneRef.current.RenderingEngine(
        renderingEngineId
      );
      renderingEngineRef.current = renderingEngine;

      const viewportId = "DICOM_VIEWPORT";
      const viewportInput = {
        viewportId,
        element: viewportRef.current,
        type: cornerstoneRef.current.Enums.ViewportType.STACK,
        defaultOptions: {
          background: [0, 0, 0], // Black background
        },
      };

      console.log("Enabling element...");
      setLoadingProgress("Enabling viewport...");
      renderingEngine.enableElement(viewportInput);

      const viewport = renderingEngine.getViewport(viewportId);

      console.log("Loading image data...");
      setLoadingProgress("Loading image data...");

      // Create a more robust loading mechanism with progress tracking
      const loadImageWithProgress = async () => {
        return new Promise(async (resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(
              new Error(
                "Loading timeout after 60 seconds. File may be corrupted, too large, or in an unsupported format."
              )
            );
          }, 60000); // Increased timeout to 60 seconds

          try {
            // Pre-load the image to check if it's valid
            setLoadingProgress("Decoding image data...");

            // Set stack with error handling
            await viewport.setStack(imageIds, 0);

            clearTimeout(timeout);
            resolve();
          } catch (err) {
            clearTimeout(timeout);
            reject(err);
          }
        });
      };

      await loadImageWithProgress();

      console.log("Rendering image...");
      setLoadingProgress("Rendering image...");

      // Render the viewport
      viewport.render();

      // Configure viewport for better viewing
      try {
        setLoadingProgress("Optimizing view...");

        // Reset camera to fit image
        viewport.resetCamera();

        // Get image properties for better display
        const imageData = viewport.getImageData();
        if (imageData) {
          console.log("Image loaded successfully:", {
            dimensions: imageData.dimensions,
            spacing: imageData.spacing,
            origin: imageData.origin,
          });
        }

        // Final render
        viewport.render();

        console.log("DICOM file loaded and rendered successfully");
      } catch (propErr) {
        console.warn("Could not optimize viewport:", propErr);
        // Don't fail if optimization fails
      }
    } catch (err) {
      console.error("Rendering error:", err);

      // Provide more specific error messages
      let errorMessage = "Failed to load DICOM file";

      if (err.message.includes("timeout")) {
        errorMessage =
          "File loading timed out. The file may be too large, corrupted, or in an unsupported DICOM format.";
      } else if (
        err.message.includes("decode") ||
        err.message.includes("parse")
      ) {
        errorMessage =
          "Unable to decode DICOM data. The file may be corrupted or use an unsupported transfer syntax.";
      } else if (
        err.message.includes("network") ||
        err.message.includes("fetch")
      ) {
        errorMessage = "Network error while loading file. Please try again.";
      } else if (
        err.message.includes("memory") ||
        err.message.includes("allocation")
      ) {
        errorMessage =
          "File is too large for available memory. Try a smaller file.";
      } else {
        errorMessage = `Loading failed: ${err.message}`;
      }

      throw new Error(errorMessage);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const syntheticEvent = {
        target: { files: files },
      };
      handleFileUpload(syntheticEvent);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const retryLoad = () => {
    if (uploadedFile) {
      const syntheticEvent = {
        target: { files: [uploadedFile] },
      };
      handleFileUpload(syntheticEvent);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (renderingEngineRef.current) {
        try {
          renderingEngineRef.current.destroy();
        } catch (err) {
          console.error("Cleanup error:", err);
        }
      }
    };
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          DICOM Viewer Trial
        </h1>
        <p className="text-gray-600">Upload and view DICOM medical images</p>
      </div>

      {/* File Upload Area */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
        <input
          ref={fileInputRef}
          type="file"
          accept=".dcm,.dicom,application/dicom,*"
          onChange={handleFileUpload}
          className="hidden"
          id="dicom-upload"
        />

        <div
          className="cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-lg font-medium text-gray-700 mb-2">
            Upload DICOM File
          </p>
          <p className="text-sm text-gray-500">
            Click to browse or drag and drop your DICOM file here
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Supports .dcm, .dicom files up to 50MB
          </p>
        </div>
      </div>

      {/* Status Messages */}
      {!isInitialized && (
        <div className="flex items-center justify-center p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <Loader2 className="animate-spin h-5 w-5 text-yellow-600 mr-2" />
          <div className="text-yellow-800">
            <div>Initializing Cornerstone.js...</div>
            {loadingProgress && (
              <div className="text-sm text-yellow-600 mt-1">
                {loadingProgress}
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <span className="text-red-800">{error}</span>
            {uploadedFile && (
              <button
                onClick={retryLoad}
                className="ml-4 inline-flex items-center text-sm text-red-700 hover:text-red-900"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <Loader2 className="animate-spin h-5 w-5 text-blue-600 mr-2" />
          <div className="text-blue-800">
            <div>Loading DICOM file...</div>
            {loadingProgress && (
              <div className="text-sm text-blue-600 mt-1">
                {loadingProgress}
              </div>
            )}
          </div>
        </div>
      )}

      {uploadedFile && !error && !isLoading && (
        <div className="flex items-center p-4 bg-green-50 border border-green-200 rounded-lg">
          <FileImage className="h-5 w-5 text-green-600 mr-2" />
          <span className="text-green-800">
            Successfully loaded: {uploadedFile.name} (
            {Math.round(uploadedFile.size / 1024)} KB)
          </span>
        </div>
      )}

      {/* DICOM Viewer Viewport */}
      <div className="border border-gray-300 rounded-lg overflow-hidden bg-black">
        <div
          ref={viewportRef}
          className="w-full h-96 bg-black cursor-crosshair"
          style={{ minHeight: "500px" }}
        />
      </div>

      {/* Instructions */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="font-semibold text-gray-800 mb-3">Instructions:</h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li>• Upload a valid DICOM file (.dcm extension recommended)</li>
          <li>• Files are validated before loading to ensure DICOM format</li>
          <li>• Maximum file size limit: 50MB</li>
          <li>• Loading timeout: 60 seconds for large files</li>
          <li>• Use mouse to interact with the image once loaded (pan/zoom)</li>
          <li>• Check browser console for detailed diagnostic information</li>
        </ul>
      </div>

      {/* Troubleshooting */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h4 className="font-medium text-amber-800 mb-2">Troubleshooting:</h4>
        <div className="text-sm text-amber-700 space-y-1">
          <p>• If loading fails, try a different DICOM file</p>
          <p>• Ensure the file is a valid DICOM format with proper headers</p>
          <p>• Large files (&gt;10MB) may take longer to load</p>
          <p>• Some transfer syntaxes may not be supported</p>
          <p>• Check that Cornerstone.js libraries are properly installed</p>
        </div>
      </div>

      {/* Required Scripts Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-800 mb-2">Dependencies:</h4>
        <p className="text-sm text-blue-700 mb-2">Install required packages:</p>
        <pre className="bg-blue-100 p-2 rounded text-xs overflow-x-auto">
          {`npm install @cornerstonejs/core @cornerstonejs/dicom-image-loader @cornerstonejs/tools`}
        </pre>
      </div>
    </div>
  );
};

export default Trial;
