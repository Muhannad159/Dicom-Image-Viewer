import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  RenderingEngine,
  Enums,
  metaData,
  imageLoader,
  init as coreInit,
} from "@cornerstonejs/core";
import {
  init as dicomImageLoaderInit,
  wadouri,
} from "@cornerstonejs/dicom-image-loader";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import {
  init as cornerstoneToolsInit,
  ToolGroupManager,
  ZoomTool,
  WindowLevelTool,
  PanTool,
  LengthTool,
  ArrowAnnotateTool,
  addTool,
  Enums as ToolsEnums,
} from "@cornerstonejs/tools";
import dicomParser from "dicom-parser";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Hand,
  Sliders,
  Ruler,
  Pen,
  Maximize,
  Minimize,
} from "lucide-react";
import { Button } from "./ui/button";

interface ViewerProps {
  files: File[];
}

function Viewer({ files }: ViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageIds, setImageIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [activeTool, setActiveTool] = useState<string | null>(
    WindowLevelTool.toolName
  );
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const toolGroupRef = useRef<any>(null);
  const lastScrollTime = useRef<number>(0);
  const viewportId = "CT_STACK";
  const renderingEngineId = "myRenderingEngine";
  const toolGroupId = "myToolGroup";
  const isViewportEnabled = useRef<boolean>(false);
  const isCoreInitialized = useRef<boolean>(false);

  // Initialize cornerstone and tools
  useEffect(() => {
    const initializeCore = async () => {
      if (!isCoreInitialized.current) {
        try {
          await coreInit();
          console.log("Cornerstone3D initialized.");
          await dicomImageLoaderInit();
          console.log("DICOM Image Loader initialized.");
          cornerstoneWADOImageLoader.init();
          console.log("WADO Image Loader initialized.");
          await cornerstoneToolsInit();
          console.log("Cornerstone Tools initialized.");
          isCoreInitialized.current = true;
        } catch (err) {
          console.error("Failed to initialize Cornerstone3D:", err);
          setError(
            `Core initialization failed: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    };
    initializeCore();
  }, []);

  // Register tools
  useEffect(() => {
    addTool(ZoomTool);
    addTool(WindowLevelTool);
    addTool(PanTool);
    addTool(LengthTool);
    addTool(ArrowAnnotateTool);
  }, []);

  // Process DICOM files
  useEffect(() => {
    console.log("Processing files, imageIds length:", imageIds.length);
    const processFiles = async () => {
      const ids: string[] = [];
      const errors: string[] = [];
      const metadataMap = new Map<string, any>();

      for (const file of files) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const byteArray = new Uint8Array(arrayBuffer);
          const dataset = dicomParser.parseDicom(byteArray);

          // Log DICOM tags
          const tags: Record<string, any> = {};
          for (const tag in dataset.elements) {
            if (tag === "x7fe00010") continue;
            tags[tag] = dataset.string(tag) || dataset.uint16(tag) || "Unknown";
          }
          console.log(`DICOM Tags for ${file.name}:`, tags);

          const transferSyntax =
            dataset.string("x00020010") || "1.2.840.10008.1.2.1";
          const blobUrl = URL.createObjectURL(file);
          const imageId = `wadouri:${blobUrl}`;
          const bitsAllocated = dataset.uint16("x00280100") || 16;
          const pixelRepresentation = dataset.uint16("x00280103") || 0;

          // Store metadata
          metadataMap.set(imageId, {
            transferSyntax: { TransferSyntaxUID: transferSyntax },
            instanceNumber: dataset.intString("x00200013") || 0,
            modality: dataset.string("x00080060") || "OT",
            studyInstanceUID: dataset.string("x0020000D") || "",
            seriesInstanceUID: dataset.string("x0020000E") || "",
            patientName: dataset.string("x00100010") || "Unknown",
            patientID: dataset.string("x00100020") || "Unknown",
            studyID: dataset.string("x00200010") || "Unknown",
            studyDate: dataset.string("x00080020") || "Unknown",
            institutionName: dataset.string("x00080080") || "Unknown",
            windowCenter: dataset.string("x00281050") || "0",
            windowWidth: dataset.string("x00281051") || "400",
            imagePixelModule: {
              samplesPerPixel: dataset.uint16("x00280002") || 1,
              rows: dataset.uint16("x00280010") || 512,
              columns: dataset.uint16("x00280011") || 512,
              bitsAllocated,
              bitsStored: dataset.uint16("x00280101") || bitsAllocated,
              highBit: dataset.uint16("x00280102") || bitsAllocated - 1,
              photometricInterpretation:
                dataset.string("x00280004") || "MONOCHROME2",
              pixelRepresentation,
            },
            generalSeriesModule: {
              modality: dataset.string("x00080060") || "OT",
              seriesInstanceUID: dataset.string("x0020000E") || "",
              seriesNumber: dataset.intString("x00200011") || 0,
            },
          });

          ids.push(imageId);
          console.log(
            `Successfully processed ${file.name}: ${imageId}, Photometric: ${
              dataset.string("x00280004") || "Unknown"
            }, Bits: ${bitsAllocated}, PixelRep: ${pixelRepresentation}`
          );
        } catch (err) {
          console.error(`Failed to process ${file.name}:`, err);
          errors.push(
            `Failed to process ${file.name}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }

      // Add metadata provider
      metaData.addProvider((type, id) => {
        const data = metadataMap.get(id);
        if (data) {
          if (type === "imagePixelModule" || type === "generalSeriesModule") {
            return data[type];
          }
          return data[type.replace("Module", "")] || undefined;
        }
        return undefined;
      }, 100);

      setImageIds(ids);
      if (errors.length > 0) {
        setError(errors.join("\n"));
      } else if (ids.length === 0) {
        setError("No valid DICOM files loaded.");
      } else {
        setError(null);
      }
    };

    processFiles();

    return () => {
      imageIds.forEach((id) => {
        if (id.startsWith("wadouri:")) {
          URL.revokeObjectURL(id.replace("wadouri:", ""));
        }
      });
      metaData.removeProvider((type, id) => true);
    };
  }, [files]);

  // Setup viewport and rendering engine
  useEffect(() => {
    if (
      !viewportRef.current ||
      !containerRef.current ||
      imageIds.length === 0 ||
      !isCoreInitialized.current
    ) {
      console.log(
        "Skipping viewport setup due to missing refs, imageIds, or core initialization"
      );
      return;
    }

    console.log("Running viewport setup effect, currentIndex:", currentIndex);

    const setupViewport = async () => {
      try {
        const element = viewportRef.current!;
        const container = containerRef.current!;
        element.style.width = `${container.clientWidth}px`;
        element.style.height = `${container.clientHeight}px`;
        console.log(
          `Viewport size set to ${container.clientWidth}x${container.clientHeight}`
        );

        // Reset RenderingEngine to avoid stale state
        if (renderingEngineRef.current) {
          renderingEngineRef.current.destroy();
          console.log("Destroyed existing RenderingEngine.");
        }
        renderingEngineRef.current = new RenderingEngine(renderingEngineId);
        console.log("RenderingEngine created.");
        const renderingEngine = renderingEngineRef.current;

        // Check WebGL context
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl");
        if (!gl) {
          throw new Error("WebGL is not supported in this browser.");
        }
        console.log("WebGL context available.");

        // Enable viewport
        isViewportEnabled.current = false;
        console.log("Enabling new viewport...");
        try {
          renderingEngine.enableElement({
            viewportId,
            element,
            type: Enums.ViewportType.STACK,
          });
          isViewportEnabled.current = true;
          console.log("Viewport element enabled.");
        } catch (enableErr) {
          throw new Error(
            `enableElement failed: ${
              enableErr instanceof Error ? enableErr.message : String(enableErr)
            }`
          );
        }

        // Validate viewport
        const viewport = renderingEngine.getViewport(
          viewportId
        ) as cornerstone.Types.IStackViewport;
        if (!viewport) {
          throw new Error(
            "Failed to retrieve valid viewport instance after enableElement."
          );
        }
        console.log("Viewport validated successfully.");

        let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
        if (!toolGroup) {
          console.log("Creating new tool group...");
          toolGroup = ToolGroupManager.createToolGroup(toolGroupId)!;
          toolGroup.addTool(ZoomTool.toolName);
          toolGroup.addTool(WindowLevelTool.toolName);
          toolGroup.addTool(PanTool.toolName);
          toolGroup.addTool(LengthTool.toolName);
          toolGroup.addTool(ArrowAnnotateTool.toolName);

          // Set initial active tool
          toolGroup.setToolActive(WindowLevelTool.toolName, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
          });
          toolGroup.addViewport(viewportId, renderingEngineId);
          console.log("Tool group created and configured.");
          toolGroupRef.current = toolGroup;
        }

        console.log("Setting stack with imageIds:", imageIds);
        try {
          console.log(`Attempting to load image: ${imageIds[currentIndex]}`);
          const image = await imageLoader
            .loadAndCacheImage(imageIds[currentIndex])
            .catch((err) => {
              throw new Error(
                `LoadAndCacheImage failed: ${
                  err instanceof Error ? err.message : String(err)
                }`
              );
            });
          console.log("Image loaded:", image);

          // Set metadata
          const imageMetadata = {
            transferSyntax:
              metaData.get("transferSyntax", imageIds[currentIndex])
                ?.TransferSyntaxUID || "Unknown",
            pixelModule:
              metaData.get("imagePixelModule", imageIds[currentIndex]) || {},
            generalSeries:
              metaData.get("generalSeriesModule", imageIds[currentIndex]) || {},
            patientName:
              metaData.get("patientName", imageIds[currentIndex]) || "Unknown",
            patientID:
              metaData.get("patientID", imageIds[currentIndex]) || "Unknown",
            studyID:
              metaData.get("studyID", imageIds[currentIndex]) || "Unknown",
            studyDate:
              metaData.get("studyDate", imageIds[currentIndex]) || "Unknown",
            seriesInstanceUID:
              metaData.get("seriesInstanceUID", imageIds[currentIndex]) ||
              "Unknown",
            instanceNumber:
              metaData.get("instanceNumber", imageIds[currentIndex]) || 0,
            institutionName:
              metaData.get("institutionName", imageIds[currentIndex]) ||
              "Unknown",
            windowCenter:
              metaData.get("windowCenter", imageIds[currentIndex]) || "0",
            windowWidth:
              metaData.get("windowWidth", imageIds[currentIndex]) || "400",
          };
          setMetadata(imageMetadata);
          console.log("Metadata set:", imageMetadata);

          console.log("Setting stack...");
          await viewport.setStack(imageIds, currentIndex).catch((err) => {
            throw new Error(
              `SetStack failed: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          });
          console.log("Stack set successfully.");

          // Set VOI range
          console.log("Computing VOI range...");
          let voiRange;
          const pixelModule =
            metaData.get("imagePixelModule", imageIds[currentIndex]) || {};
          const windowCenter = parseFloat(imageMetadata.windowCenter) || 0;
          const windowWidth = parseFloat(imageMetadata.windowWidth) || 400;
          if (windowCenter && windowWidth) {
            voiRange = {
              lower: windowCenter - windowWidth / 2,
              upper: windowCenter + windowWidth / 2,
            };
            console.log(
              `VOI range from DICOM: ${voiRange.lower} to ${voiRange.upper}`
            );
          } else {
            const pixelData = image.getPixelData();
            let min, max;
            if (
              pixelModule.pixelRepresentation === 1 &&
              pixelModule.bitsAllocated === 16
            ) {
              // Signed 16-bit
              const signedData = new Int16Array(pixelData.buffer);
              min = Math.min(...signedData);
              max = Math.max(...signedData);
            } else {
              // Unsigned or 8-bit
              const unsignedData =
                pixelModule.bitsAllocated === 16
                  ? new Uint16Array(pixelData.buffer)
                  : new Uint8Array(pixelData.buffer);
              min = Math.min(...unsignedData);
              max = Math.max(...unsignedData);
            }
            voiRange = { lower: min, upper: max };
            console.log(`VOI range computed: ${min} to ${max}`);
          }
          if (voiRange.lower !== voiRange.upper) {
            viewport.setProperties({ voiRange });
            console.log(
              `VOI range applied: ${voiRange.lower} to ${voiRange.upper}`
            );
          } else {
            console.warn("Invalid VOI range, applying fallback.");
            voiRange = { lower: -1024, upper: 3071 }; // Typical CT range
            viewport.setProperties({ voiRange });
            console.log(
              `Fallback VOI range applied: ${voiRange.lower} to ${voiRange.upper}`
            );
          }

          // Auto-fit to window
          console.log("Auto-fitting to window...");
          viewport.reset();
          setZoomLevel(Math.round(viewport.getZoom() * 100));
          console.log(
            "Viewport auto-fitted, initial zoom:",
            viewport.getZoom()
          );

          console.log("Rendering viewport...");
          try {
            viewport.render();
            console.log(
              "Viewport rendered with imageId:",
              imageIds[currentIndex]
            );
          } catch (renderErr) {
            throw new Error(
              `render failed: ${
                renderErr instanceof Error
                  ? renderErr.message
                  : String(renderErr)
              }`
            );
          }
        } catch (err) {
          console.error("Image loading or rendering failed:", err);
          setError(
            `Failed to load or render image: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      } catch (err) {
        console.error("Viewport setup failed:", err);
        setError(
          `Viewport error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      if (
        viewportRef.current &&
        containerRef.current &&
        renderingEngineRef.current
      ) {
        viewportRef.current.style.width = `${containerRef.current.clientWidth}px`;
        viewportRef.current.style.height = `${containerRef.current.clientHeight}px`;
        console.log(
          `Viewport resized to ${containerRef.current.clientWidth}x${containerRef.current.clientHeight}`
        );
        renderingEngineRef.current.resize();
        const viewport = renderingEngineRef.current.getViewport(
          viewportId
        ) as cornerstone.Types.IStackViewport;
        if (viewport) {
          viewport.render();
          setZoomLevel(Math.round(viewport.getZoom() * 100));
        }
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    setupViewport();

    return () => {
      console.log("Cleaning up viewport effect...");
      resizeObserver.disconnect();
      ToolGroupManager.destroyToolGroup(toolGroupId);
    };
  }, [imageIds, currentIndex]);

  // Update active tool and zoom level
  useEffect(() => {
    if (toolGroupRef.current && activeTool) {
      console.log("Updating active tool:", activeTool);
      const tools = [
        ZoomTool.toolName,
        WindowLevelTool.toolName,
        PanTool.toolName,
        LengthTool.toolName,
        ArrowAnnotateTool.toolName,
      ];
      tools.forEach((tool) => {
        if (tool === activeTool) {
          toolGroupRef.current.setToolActive(tool, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
          });
        } else {
          toolGroupRef.current.setToolPassive(tool);
        }
      });
      console.log(`Active tool set to: ${activeTool}`);

      // Update zoom level on tool interaction
      const viewport = renderingEngineRef.current?.getViewport(
        viewportId
      ) as cornerstone.Types.IStackViewport;
      if (viewport) {
        const handleInteraction = () => {
          setZoomLevel(Math.round(viewport.getZoom() * 100));
          console.log("Zoom level updated:", viewport.getZoom());
        };
        viewport.getCanvas().addEventListener("mousedown", handleInteraction);
        viewport.getCanvas().addEventListener("wheel", handleInteraction);
        return () => {
          viewport
            .getCanvas()
            .removeEventListener("mousedown", handleInteraction);
          viewport.getCanvas().removeEventListener("wheel", handleInteraction);
        };
      }
    }
  }, [activeTool]);

  // Tool activation handlers
  const activateTool = (toolName: string) => {
    setActiveTool(toolName);
  };

  // Fit to window
  const fitToWindow = () => {
    const viewport = renderingEngineRef.current?.getViewport(
      viewportId
    ) as cornerstone.Types.IStackViewport;
    if (viewport) {
      viewport.reset();
      setZoomLevel(Math.round(viewport.getZoom() * 100));
      viewport.render();
      console.log("Fit to window applied, zoom:", viewport.getZoom());
    }
  };

  // Actual size (100% scale)
  const actualSize = () => {
    const viewport = renderingEngineRef.current?.getViewport(
      viewportId
    ) as cornerstone.Types.IStackViewport;
    if (viewport) {
      viewport.setZoom(1.0);
      setZoomLevel(100);
      viewport.render();
      console.log("Actual size applied, zoom: 1.0");
    }
  };

  // Custom scrolling with throttle
  const handleScroll = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      const now = Date.now();
      if (now - lastScrollTime.current < 200) return;
      lastScrollTime.current = now;

      const direction = Math.sign(event.deltaY);
      const nextIndex = Math.min(
        Math.max(0, currentIndex + direction),
        imageIds.length - 1
      );

      if (nextIndex !== currentIndex) {
        setCurrentIndex(nextIndex);
        console.log("Scroll to index:", nextIndex);
      }
    },
    [currentIndex, imageIds]
  );

  // Mouse wheel scrolling
  useEffect(() => {
    const element = viewportRef.current;
    if (element) {
      element.addEventListener("wheel", handleScroll, { passive: false });
    }

    return () => {
      if (element) {
        element.removeEventListener("wheel", handleScroll);
      }
    };
  }, [handleScroll]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
        console.log("Navigated to previous image:", currentIndex - 1);
      } else if (
        event.key === "ArrowRight" &&
        currentIndex < imageIds.length - 1
      ) {
        setCurrentIndex(currentIndex + 1);
        console.log("Navigated to next image:", currentIndex + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, imageIds]);

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-red-500 p-4">
        <div className="text-lg font-medium mb-2">Error</div>
        <div className="text-sm whitespace-pre-wrap">{error}</div>
        <Button
          className="mt-4"
          onClick={() => console.warn("setFiles not implemented")}
        >
          Back to Upload
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b px-4 py-2 flex gap-2">
        <Button
          variant={activeTool === ZoomTool.toolName ? "default" : "outline"}
          size="icon"
          onClick={() => activateTool(ZoomTool.toolName)}
          title="Zoom"
        >
          <ZoomIn size={20} />
        </Button>
        <Button
          variant={activeTool === PanTool.toolName ? "default" : "outline"}
          size="icon"
          onClick={() => activateTool(PanTool.toolName)}
          title="Pan"
        >
          <Hand size={20} />
        </Button>
        <Button
          variant={
            activeTool === WindowLevelTool.toolName ? "default" : "outline"
          }
          size="icon"
          onClick={() => activateTool(WindowLevelTool.toolName)}
          title="Window Level/Width"
        >
          <Sliders size={20} />
        </Button>
        <Button
          variant={activeTool === LengthTool.toolName ? "default" : "outline"}
          size="icon"
          onClick={() => activateTool(LengthTool.toolName)}
          title="Measure Length"
        >
          <Ruler size={20} />
        </Button>
        <Button
          variant={
            activeTool === ArrowAnnotateTool.toolName ? "default" : "outline"
          }
          size="icon"
          onClick={() => activateTool(ArrowAnnotateTool.toolName)}
          title="Annotate"
        >
          <Pen size={20} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={fitToWindow}
          title="Fit to Window"
        >
          <Maximize size={20} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={actualSize}
          title="Actual Size"
        >
          <Minimize size={20} />
        </Button>
        <span className="px-2 text-sm text-gray-700">Zoom: {zoomLevel}%</span>
      </div>
      <div
        ref={containerRef}
        className="flex-1 bg-black relative"
        style={{ minHeight: "0" }}
      >
        <div
          ref={viewportRef}
          className="w-full h-full"
          style={{ display: "block" }}
        />
        {/* Metadata in four corners */}
        {metadata && (
          <>
            <div className="absolute top-2 left-2 text-emerald-500 text-xs bg-gray-900 bg-opacity-50 p-1 rounded">
              <div>Patient: {metadata.patientName || "N/A"}</div>
              <div>ID: {metadata.patientID || "N/A"}</div>
            </div>
            <div className="absolute top-2 right-2 text-emerald-500 text-xs bg-gray-900 bg-opacity-50 p-1 rounded">
              <div>Date: {metadata.studyDate || "N/A"}</div>
              <div>Study: {metadata.studyID || "N/A"}</div>
            </div>
            <div className="absolute bottom-2 left-2 text-emerald-500 text-xs bg-gray-900 bg-opacity-50 p-1 rounded">
              <div>Modality: {metadata.generalSeries?.modality || "N/A"}</div>
              <div>Institution: {metadata.institutionName || "N/A"}</div>
            </div>
            <div className="absolute bottom-2 right-2 text-emerald-500 text-xs bg-gray-900 bg-opacity-50 p-1 rounded">
              <div>
                Series: {metadata.seriesInstanceUID?.slice(-8) || "N/A"}
              </div>
              <div>
                Image: {currentIndex + 1} / {imageIds.length}
              </div>
              <div>
                WC/WW: {metadata.windowCenter}/{metadata.windowWidth || "N/A"}
              </div>
            </div>
          </>
        )}
        {imageIds.length > 1 && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-white rounded-lg px-2 py-1 flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
            >
              <ChevronLeft size={20} />
            </Button>
            <span className="px-2 text-sm">
              {currentIndex + 1} / {imageIds.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const nextIndex = Math.min(
                  imageIds.length - 1,
                  currentIndex + 1
                );
                console.log(
                  "Navigating to next image, currentIndex:",
                  nextIndex
                );
                setCurrentIndex(nextIndex);
              }}
              disabled={currentIndex === imageIds.length - 1}
            >
              <ChevronRight size={20} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Viewer;
