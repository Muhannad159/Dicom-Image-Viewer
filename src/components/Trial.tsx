import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  init as coreInit,
  registerImageLoader,
  RenderingEngine,
  Enums,
  utilities,
} from "@cornerstonejs/core";
import type { Types } from "@cornerstonejs/core";
import {
  init as dicomImageLoaderInit,
  wadouri,
} from "@cornerstonejs/dicom-image-loader";
import {
  init as cornerstoneToolsInit,
  ToolGroupManager,
  PanTool,
  ZoomTool,
  WindowLevelTool,
  LengthTool,
  RectangleROITool,
  EllipticalROITool,
  AngleTool,
  StackScrollTool,
  addTool,
  Enums as ToolEnums,
} from "@cornerstonejs/tools";
import dicomParser from "dicom-parser";

// Initialize Cornerstone3D
coreInit();
dicomImageLoaderInit();
cornerstoneToolsInit();

// Register image loader
registerImageLoader("wadouri", wadouri.loadImage);

// Add tools
addTool(PanTool);
addTool(ZoomTool);
addTool(WindowLevelTool);
addTool(LengthTool);
addTool(RectangleROITool);
addTool(EllipticalROITool);
addTool(AngleTool);
addTool(StackScrollTool);

interface Series {
  studyID: string;
  seriesNumber: string;
  seriesDescription: string;
  instances: { imageId: string; instanceNumber?: number }[];
  thumbnail: string | null;
  modality?: string;
}

interface Stack {
  imageIds: string[];
  currentImageIndex: number;
}

const Trial: React.FC = () => {
  const dicomImageRef = useRef<HTMLDivElement>(null);
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const viewportRef = useRef<Types.IStackViewport | null>(null);
  const toolGroupRef = useRef<any>(null);
  const lastScrollTime = useRef<number>(0);
  const blobUrlsRef = useRef<string[]>([]);

  const [groupedSeries, setGroupedSeries] = useState<Record<string, Series>>(
    {}
  );
  const [stack, setStack] = useState<Stack>({
    imageIds: [],
    currentImageIndex: 0,
  });
  const [selectedSeriesKey, setSelectedSeriesKey] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTool, setActiveTool] = useState<string>("Pan");
  const [windowLevel, setWindowLevel] = useState<{
    width: number;
    center: number;
  }>({ width: 400, center: 40 });
  const [currentImageInfo, setCurrentImageInfo] = useState<string>("");

  const renderingEngineId = "myRenderingEngine";
  const viewportId = "CT_STACK";
  const toolGroupId = "STACK_TOOL_GROUP_ID";

  useEffect(() => {
    const initializeCornerstone = async () => {
      if (!dicomImageRef.current) return;

      try {
        // Create rendering engine
        const renderingEngine = new RenderingEngine(renderingEngineId);
        renderingEngineRef.current = renderingEngine;

        // Define viewport
        const viewportInput = {
          viewportId,
          type: Enums.ViewportType.STACK,
          element: dicomImageRef.current,
          defaultOptions: {
            background: [0, 0, 0] as Types.Point3,
          },
        };

        renderingEngine.enableElement(viewportInput);
        const viewport = renderingEngine.getViewport(
          viewportId
        ) as Types.IStackViewport;
        viewportRef.current = viewport;

        // Create tool group
        const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
        toolGroupRef.current = toolGroup;

        // Add tools to tool group
        toolGroup.addTool(PanTool.toolName);
        toolGroup.addTool(ZoomTool.toolName);
        toolGroup.addTool(WindowLevelTool.toolName);
        toolGroup.addTool(LengthTool.toolName);
        toolGroup.addTool(RectangleROITool.toolName);
        toolGroup.addTool(EllipticalROITool.toolName);
        toolGroup.addTool(AngleTool.toolName);
        toolGroup.addTool(StackScrollTool.toolName);

        // Set default tool modes
        toolGroup.setToolActive(PanTool.toolName, {
          bindings: [
            {
              mouseButton: ToolEnums.MouseBindings.Primary,
            },
          ],
        });
        toolGroup.setToolActive(ZoomTool.toolName, {
          bindings: [
            {
              mouseButton: ToolEnums.MouseBindings.Secondary,
            },
          ],
        });
        toolGroup.setToolActive(WindowLevelTool.toolName, {
          bindings: [
            {
              mouseButton: ToolEnums.MouseBindings.Primary,
              modifierKey: ToolEnums.KeyboardBindings.Shift,
            },
          ],
        });
        toolGroup.setToolActive(StackScrollTool.toolName);

        // Set other tools as passive
        toolGroup.setToolPassive(LengthTool.toolName);
        toolGroup.setToolPassive(RectangleROITool.toolName);
        toolGroup.setToolPassive(EllipticalROITool.toolName);
        toolGroup.setToolPassive(AngleTool.toolName);

        // Add viewport to tool group
        toolGroup.addViewport(viewportId, renderingEngineId);
      } catch (error) {
        console.error("Error initializing Cornerstone3D:", error);
      }
    };

    initializeCornerstone();

    return () => {
      // Cleanup blob URLs
      blobUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      blobUrlsRef.current = [];

      // Cleanup Cornerstone
      if (renderingEngineRef.current) {
        renderingEngineRef.current.destroy();
      }
      if (toolGroupRef.current) {
        ToolGroupManager.destroyToolGroup(toolGroupId);
      }
    };
  }, []);

  useEffect(() => {
    if (stack.imageIds.length > 0 && viewportRef.current) {
      loadDicomImage();
    }
  }, [stack]);

  const handleFolderUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setIsLoading(true);
    const files = Array.from(event.target.files || []).filter(
      (file) =>
        file.name.toLowerCase().endsWith(".dcm") ||
        file.name.toLowerCase().includes("dicom") ||
        file.type === "application/dicom" ||
        !file.name.includes(".") // Some DICOM files have no extension
    );
    if (files.length > 0) {
      await processDicomFiles(files);
    }
    setIsLoading(false);
  };

  const processDicomFiles = async (files: File[]) => {
    const grouped: Record<string, Series> = {};

    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();

        // Try to parse the DICOM file
        let dataset;
        try {
          dataset = dicomParser.parseDicom(new Uint8Array(arrayBuffer));
        } catch (parseError) {
          console.warn(`Could not parse ${file.name} as DICOM:`, parseError);
          continue;
        }

        const studyID = dataset.string("x00200010") || "Unknown Study";
        const seriesNumber = dataset.string("x00200011") || "Unknown Series";
        const instanceNumber = dataset.string("x00200013") || "1";
        const seriesKey = `${studyID}|${seriesNumber}`;
        const seriesDescription =
          dataset.string("x0008103e") || "Unknown Description";
        const modality = dataset.string("x00080060") || "Unknown";

        // Get pixel data information for debugging
        const photometricInterpretation = dataset.string("x00280004");
        const bitsAllocated = dataset.uint16("x00280100");
        const bitsStored = dataset.uint16("x00280101");
        const pixelRepresentation = dataset.uint16("x00280103");
        const samplesPerPixel = dataset.uint16("x00280002") || 1;
        const rows = dataset.uint16("x00280010");
        const columns = dataset.uint16("x00280011");

        // Window/Level information
        const windowCenter = dataset.string("x00281050");
        const windowWidth = dataset.string("x00281051");
        const rescaleIntercept = dataset.floatString("x00281052") || 0;
        const rescaleSlope = dataset.floatString("x00281053") || 1;

        console.log(`Processing file: ${file.name}`);
        console.log(`Modality: ${modality}`);
        console.log(`Dimensions: ${columns}x${rows}`);
        console.log(`Photometric Interpretation: ${photometricInterpretation}`);
        console.log(`Bits Allocated/Stored: ${bitsAllocated}/${bitsStored}`);
        console.log(`Pixel Representation: ${pixelRepresentation}`);
        console.log(`Samples Per Pixel: ${samplesPerPixel}`);
        console.log(`Window Center/Width: ${windowCenter}/${windowWidth}`);
        console.log(
          `Rescale Intercept/Slope: ${rescaleIntercept}/${rescaleSlope}`
        );

        if (!grouped[seriesKey]) {
          grouped[seriesKey] = {
            studyID,
            seriesNumber,
            seriesDescription,
            modality,
            instances: [],
            thumbnail: null,
          };
        }

        // Create blob URL and use wadouri scheme
        const blob = new Blob([arrayBuffer], { type: "application/dicom" });
        const blobUrl = URL.createObjectURL(blob);
        blobUrlsRef.current.push(blobUrl);
        const imageId = `wadouri:${blobUrl}`;

        grouped[seriesKey].instances.push({
          imageId,
          instanceNumber: parseInt(instanceNumber),
        });

        // Generate thumbnail for first instance
        if (!grouped[seriesKey].thumbnail) {
          try {
            await generateThumbnail(imageId, seriesKey, grouped);
          } catch (error) {
            console.error("Error generating thumbnail:", error);
          }
        }
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
      }
    }

    setGroupedSeries(grouped);
  };

  const generateThumbnail = async (
    imageId: string,
    seriesKey: string,
    grouped: Record<string, Series>
  ) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;
      const context = canvas.getContext("2d")!;

      // Try to load and render the actual image for thumbnail
      try {
        const image = await utilities.loadImageToCanvas({
          canvas: canvas,
          imageId: imageId,
          requestType: "thumbnail",
        });
        grouped[seriesKey].thumbnail = canvas.toDataURL();
      } catch (thumbnailError) {
        // Fallback to placeholder
        context.fillStyle = "black";
        context.fillRect(0, 0, 100, 100);
        context.fillStyle = "white";
        context.font = "10px Arial";
        context.textAlign = "center";
        context.fillText("DICOM", 50, 45);
        context.fillText(grouped[seriesKey].modality || "", 50, 60);
        grouped[seriesKey].thumbnail = canvas.toDataURL();
      }
    } catch (error) {
      console.error("Error generating thumbnail:", error);
      grouped[seriesKey].thumbnail = null;
    }
  };

  const handleSeriesClick = async (series: Series) => {
    setIsLoading(true);

    const seriesKey = `${series.studyID}|${series.seriesNumber}`;

    // Sort instances by instance number
    const sortedInstances = series.instances.sort((a, b) => {
      const aNum = a.instanceNumber || 0;
      const bNum = b.instanceNumber || 0;
      return aNum - bNum;
    });

    const imageIds = sortedInstances.map((instance) => instance.imageId);
    setStack({ imageIds, currentImageIndex: 0 });
    setSelectedSeriesKey(seriesKey);

    setIsLoading(false);
  };

  const loadDicomImage = async () => {
    if (!viewportRef.current || stack.imageIds.length === 0) return;

    const viewport = viewportRef.current;

    try {
      await viewport.setStack(stack.imageIds, stack.currentImageIndex);

      // Wait for the image to load properly
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Try multiple approaches to fix black images
      const image = viewport.getImageData();
      if (image) {
        const imageScalarData = image.getScalarData();

        if (imageScalarData && imageScalarData.length > 0) {
          // Calculate comprehensive image statistics
          let min = Infinity;
          let max = -Infinity;
          let sum = 0;
          let nonZeroCount = 0;
          let nonZeroSum = 0;
          const length = imageScalarData.length;
          const values: number[] = [];

          // Full scan for accurate statistics
          for (let i = 0; i < length; i++) {
            const value = imageScalarData[i];
            values.push(value);

            if (value < min) min = value;
            if (value > max) max = value;
            sum += value;

            if (value !== 0) {
              nonZeroCount++;
              nonZeroSum += value;
            }
          }

          const mean = sum / length;
          const nonZeroMean =
            nonZeroCount > 0 ? nonZeroSum / nonZeroCount : mean;

          // Calculate percentiles for better windowing
          values.sort((a, b) => a - b);
          const p1 = values[Math.floor(length * 0.01)];
          const p99 = values[Math.floor(length * 0.99)];
          const p5 = values[Math.floor(length * 0.05)];
          const p95 = values[Math.floor(length * 0.95)];

          console.log(`Image statistics:`, {
            min,
            max,
            mean,
            nonZeroMean,
            p1,
            p5,
            p95,
            p99,
            totalPixels: length,
            nonZeroPixels: nonZeroCount,
          });

          // Determine best windowing strategy
          let windowWidth, windowCenter;

          // Get current series info
          const currentSeries = Object.values(groupedSeries).find((series) =>
            series.instances.some(
              (instance) =>
                instance.imageId === stack.imageIds[stack.currentImageIndex]
            )
          );

          // Strategy 1: Use percentile-based windowing (most robust)
          if (p99 > p1) {
            windowWidth = p99 - p1;
            windowCenter = (p99 + p1) / 2;
          } else if (max > min) {
            // Strategy 2: Full range
            windowWidth = max - min;
            windowCenter = (max + min) / 2;
          } else {
            // Strategy 3: Default fallback
            windowWidth = 1000;
            windowCenter = 500;
          }

          // Apply modality-specific adjustments
          if (currentSeries?.modality) {
            switch (currentSeries.modality.toUpperCase()) {
              case "CT":
                // For CT, if the calculated values seem wrong, use standard presets
                if (
                  windowWidth < 50 ||
                  windowCenter < -1000 ||
                  windowCenter > 3000
                ) {
                  windowWidth = 400;
                  windowCenter = 40;
                }
                break;
              case "MR":
                // For MR, ensure we're using non-zero mean if available
                if (nonZeroCount > length * 0.1) {
                  // If more than 10% non-zero pixels
                  windowCenter = nonZeroMean;
                  windowWidth = Math.max(windowWidth, (p95 - p5) * 1.5);
                }
                break;
              case "US":
                // Ultrasound typically needs full dynamic range
                windowWidth = Math.max(windowWidth, max - min);
                break;
              case "CR":
              case "DX":
                // Radiography - often needs contrast adjustment
                windowWidth = Math.max(windowWidth, (p95 - p5) * 2);
                windowCenter = (p95 + p5) / 2;
                break;
            }
          }

          // Final safety checks
          if (windowWidth <= 0 || !isFinite(windowWidth)) {
            windowWidth = Math.max(1, max - min);
          }
          if (!isFinite(windowCenter)) {
            windowCenter = mean;
          }

          // Additional check for very small ranges
          if (windowWidth < 1) {
            windowWidth = 1000;
          }

          console.log(
            `Applied windowing: Width=${windowWidth}, Center=${windowCenter}`
          );

          // Apply the windowing
          viewport.setProperties({
            windowWidth: windowWidth,
            windowCenter: windowCenter,
          });

          setWindowLevel({
            width: Math.round(windowWidth),
            center: Math.round(windowCenter),
          });

          // Update image info
          const modalityInfo = currentSeries?.modality || "Unknown";
          setCurrentImageInfo(
            `${Math.round(min)} to ${Math.round(max)} (${modalityInfo})`
          );

          // Force a render
          viewport.render();

          // If image still appears black, try alternative rendering
          setTimeout(() => {
            const canvas = viewport.getCanvas();
            const ctx = canvas.getContext("2d");
            if (ctx) {
              const imageData = ctx.getImageData(
                0,
                0,
                canvas.width,
                canvas.height
              );
              const data = imageData.data;

              // Check if canvas is still black
              let hasNonBlackPixels = false;
              for (let i = 0; i < data.length; i += 4) {
                if (data[i] > 0 || data[i + 1] > 0 || data[i + 2] > 0) {
                  hasNonBlackPixels = true;
                  break;
                }
              }

              if (!hasNonBlackPixels) {
                console.warn(
                  "Image still appears black, trying extreme windowing"
                );
                // Try extreme windowing as last resort
                viewport.setProperties({
                  windowWidth: (max - min) * 10,
                  windowCenter: mean,
                });
                viewport.render();
              }
            }
          }, 100);
        }
      }
    } catch (error) {
      console.error("Error loading DICOM image:", error);

      // Enhanced error reporting
      const imageId = stack.imageIds[stack.currentImageIndex];
      console.log("Failed image ID:", imageId);

      // Try to load the image directly for debugging
      try {
        const testCanvas = document.createElement("canvas");
        testCanvas.width = 512;
        testCanvas.height = 512;

        const testImage = await utilities.loadImageToCanvas({
          canvas: testCanvas,
          imageId: imageId,
        });

        console.log("Direct load successful:", testImage);

        // If direct load works, there might be a viewport issue
        if (testImage) {
          console.log(
            "Image loads directly but not in viewport - trying viewport reset"
          );
          viewport.resetCamera();
          viewport.render();
        }
      } catch (directLoadError) {
        console.error("Direct image load also failed:", directLoadError);

        // Try to extract and log DICOM metadata from the blob
        try {
          const blobUrl = imageId.replace("wadouri:", "");
          const response = await fetch(blobUrl);
          const arrayBuffer = await response.arrayBuffer();
          const dataset = dicomParser.parseDicom(new Uint8Array(arrayBuffer));

          console.log("DICOM metadata:", {
            photometricInterpretation: dataset.string("x00280004"),
            bitsAllocated: dataset.uint16("x00280100"),
            bitsStored: dataset.uint16("x00280101"),
            pixelRepresentation: dataset.uint16("x00280103"),
            samplesPerPixel: dataset.uint16("x00280002"),
            rows: dataset.uint16("x00280010"),
            columns: dataset.uint16("x00280011"),
            transferSyntax: dataset.string("x00020010"),
          });
        } catch (metadataError) {
          console.error("Could not extract metadata:", metadataError);
        }
      }
    }
  };

  const handleScroll = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      const now = Date.now();
      if (now - lastScrollTime.current < 100) return;
      lastScrollTime.current = now;

      const direction = Math.sign(event.deltaY);
      const nextIndex = Math.min(
        Math.max(0, stack.currentImageIndex + direction),
        stack.imageIds.length - 1
      );

      if (nextIndex !== stack.currentImageIndex && viewportRef.current) {
        setStack((prev) => ({ ...prev, currentImageIndex: nextIndex }));
        viewportRef.current.setImageIdIndex(nextIndex);
      }
    },
    [stack]
  );

  useEffect(() => {
    const element = dicomImageRef.current;
    if (!element) return;

    element.addEventListener("wheel", handleScroll, { passive: false });
    return () => element.removeEventListener("wheel", handleScroll);
  }, [handleScroll]);

  const activateTool = (toolName: string) => {
    if (!toolGroupRef.current) return;

    const toolGroup = toolGroupRef.current;

    // Set all annotation tools to passive first
    toolGroup.setToolPassive(LengthTool.toolName);
    toolGroup.setToolPassive(RectangleROITool.toolName);
    toolGroup.setToolPassive(EllipticalROITool.toolName);
    toolGroup.setToolPassive(AngleTool.toolName);

    // Activate the selected tool
    if (
      toolName !== "Pan" &&
      toolName !== "Zoom" &&
      toolName !== "WindowLevel"
    ) {
      toolGroup.setToolActive(toolName, {
        bindings: [
          {
            mouseButton: ToolEnums.MouseBindings.Primary,
          },
        ],
      });
    }

    setActiveTool(toolName);
  };

  const resetView = () => {
    if (!viewportRef.current) return;
    viewportRef.current.resetCamera();
    viewportRef.current.render();
  };

  const applyWindowLevel = (width: number, center: number) => {
    if (!viewportRef.current) return;
    viewportRef.current.setProperties({
      windowWidth: width,
      windowCenter: center,
    });
    viewportRef.current.render();
    setWindowLevel({ width, center });
  };

  const applyPreset = (preset: string) => {
    const presets = {
      "CT Abdomen": { width: 400, center: 40 },
      "CT Bone": { width: 1000, center: 400 },
      "CT Brain": { width: 100, center: 50 },
      "CT Lung": { width: 1600, center: -600 },
      "MR T1": { width: 600, center: 300 },
      "MR T2": { width: 1000, center: 500 },
      "Full Range": { width: 4000, center: 2000 },
      Auto: { width: 0, center: 0 }, // Trigger auto-windowing
    };

    const values = presets[preset as keyof typeof presets];
    if (values) {
      if (preset === "Auto") {
        loadDicomImage(); // Retrigger auto-windowing
      } else {
        applyWindowLevel(values.width, values.center);
      }
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-1/4 bg-gray-100 p-4 overflow-y-auto border-r">
        <h2 className="font-bold text-lg mb-4 text-gray-800">DICOM Series</h2>

        {Object.keys(groupedSeries).length === 0 ? (
          <p className="text-gray-600 text-sm">No series loaded</p>
        ) : (
          Object.keys(groupedSeries).map((seriesKey) => {
            const series = groupedSeries[seriesKey];
            const isSelected = selectedSeriesKey === seriesKey;

            return (
              <div
                key={seriesKey}
                className={`p-3 mb-2 border rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-blue-100 border-blue-300"
                    : "bg-white border-gray-200 hover:bg-gray-50"
                }`}
                onClick={() => handleSeriesClick(series)}
              >
                <div className="flex items-center gap-3">
                  {series.thumbnail && (
                    <img
                      src={series.thumbnail}
                      alt={`Series ${series.seriesNumber}`}
                      className="w-16 h-16 border border-gray-300 rounded"
                    />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">
                      {series.seriesDescription}
                    </p>
                    <p className="text-xs text-gray-600">
                      {series.modality} - Series: {series.seriesNumber}
                    </p>
                    <p className="text-xs text-gray-600">
                      Images: {series.instances.length}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Main Viewer */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="bg-white border-b p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <label
              htmlFor="file-upload"
              className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm"
            >
              Load DICOM Files
            </label>
            <input
              id="file-upload"
              type="file"
              multiple
              webkitdirectory=""
              className="hidden"
              onChange={handleFolderUpload}
            />

            <div className="flex items-center gap-2 border-l pl-3">
              <span className="text-sm text-gray-600">Tools:</span>
              <button
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  activeTool === "Pan"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
                onClick={() => activateTool("Pan")}
              >
                Pan
              </button>
              <button
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  activeTool === "Length"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
                onClick={() => activateTool(LengthTool.toolName)}
              >
                Length
              </button>
              <button
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  activeTool === "RectangleROI"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
                onClick={() => activateTool(RectangleROITool.toolName)}
              >
                Rectangle
              </button>
              <button
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  activeTool === "EllipticalROI"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
                onClick={() => activateTool(EllipticalROITool.toolName)}
              >
                Ellipse
              </button>
              <button
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  activeTool === "Angle"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
                onClick={() => activateTool(AngleTool.toolName)}
              >
                Angle
              </button>
            </div>

            <button
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              onClick={resetView}
            >
              Reset View
            </button>

            <div className="flex items-center gap-2 border-l pl-3">
              <span className="text-sm text-gray-600">Presets:</span>
              <select
                className="px-2 py-1 text-sm border rounded"
                onChange={(e) => applyPreset(e.target.value)}
                defaultValue=""
              >
                <option value="" disabled>
                  Select Preset
                </option>
                <option value="Auto">Auto Window/Level</option>
                <option value="CT Abdomen">CT Abdomen</option>
                <option value="CT Bone">CT Bone</option>
                <option value="CT Brain">CT Brain</option>
                <option value="CT Lung">CT Lung</option>
                <option value="MR T1">MR T1</option>
                <option value="MR T2">MR T2</option>
                <option value="Full Range">Full Range</option>
              </select>
            </div>

            <div className="flex items-center gap-2 border-l pl-3">
              <span className="text-sm text-gray-600">W/L:</span>
              <input
                type="number"
                placeholder="Width"
                className="w-16 px-1 py-1 text-xs border rounded"
                value={windowLevel.width}
                onChange={(e) => {
                  const width = parseInt(e.target.value) || 400;
                  applyWindowLevel(width, windowLevel.center);
                }}
              />
              <input
                type="number"
                placeholder="Center"
                className="w-16 px-1 py-1 text-xs border rounded"
                value={windowLevel.center}
                onChange={(e) => {
                  const center = parseInt(e.target.value) || 40;
                  applyWindowLevel(windowLevel.width, center);
                }}
              />
            </div>
          </div>
        </div>

        {/* Viewport */}
        <div className="flex-1 p-4 bg-gray-100">
          <div className="h-full flex items-center justify-center">
            <div
              ref={dicomImageRef}
              className="border border-gray-300 rounded-lg bg-black"
              style={{ width: "800px", height: "600px" }}
            >
              {stack.imageIds.length === 0 && (
                <div className="h-full flex items-center justify-center">
                  <p className="text-gray-400 text-lg">
                    Select a series to view images
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Image info and counter */}
          {stack.imageIds.length > 0 && (
            <div className="text-center mt-4">
              <p className="text-gray-600">
                Image {stack.currentImageIndex + 1} of {stack.imageIds.length}
              </p>
              {currentImageInfo && (
                <p className="text-sm text-gray-500">
                  Range: {currentImageInfo}
                </p>
              )}
              <p className="text-sm text-gray-500">
                Use mouse wheel to scroll through images
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex justify-center items-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-6 rounded-lg flex items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-600"></div>
            <span className="text-gray-700">Loading DICOM files...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Trial;
