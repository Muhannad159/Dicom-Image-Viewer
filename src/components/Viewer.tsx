import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  RenderingEngine,
  Enums,
  metaData,
  imageLoader,
  init as coreInit,
} from "@cornerstonejs/core";
import { init as dicomImageLoaderInit } from "@cornerstonejs/dicom-image-loader";
import {
  init as cornerstoneToolsInit,
  ToolGroupManager,
  ZoomTool,
  WindowLevelTool,
  PanTool,
  LengthTool,
  ArrowAnnotateTool,
  AngleTool,
  CircleROITool,
  EllipticalROITool,
  RectangleROITool,
  PlanarRotateTool,
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
  Square,
  Circle,
  RotateCw,
} from "lucide-react";
import { Button } from "./ui/button";

interface Series {
  seriesInstanceUID: string;
  seriesNumber: number;
  modality: string;
  imageIds: string[];
  thumbnail?: string;
}

interface ViewerProps {
  files: File[];
}

function Viewer({ files }: ViewerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [selectedSeriesUID, setSelectedSeriesUID] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [activeTool, setActiveTool] = useState<string | null>(
    WindowLevelTool.toolName
  );
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isWadoInitialized, setIsWadoInitialized] = useState<boolean>(false);
  const [isViewportReady, setIsViewportReady] = useState<boolean>(false);
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const toolGroupRef = useRef<any>(null);
  const lastScrollTime = useRef<number>(0);
  const viewportId = "CT_STACK";
  const renderingEngineId = "myRenderingEngine";
  const toolGroupId = "myToolGroup";
  const isViewportEnabled = useRef<boolean>(false);
  const isCoreInitialized = useRef<boolean>(false);
  const metadataMapRef = useRef<Map<string, any>>(new Map());
  const VIEWPORT_SCALE = 0.9; // Reduce viewport size by 10%

  // Debounced zoom update
  const debounceZoom = useCallback((zoom: number) => {
    setZoomLevel(zoom);
    console.log("Debounced zoom level set:", zoom);
  }, []);

  // Initialize cornerstone and tools
  useEffect(() => {
    const initializeCore = async () => {
      if (!isCoreInitialized.current) {
        try {
          console.log("Starting Cornerstone3D initialization...");
          await coreInit();
          console.log("Cornerstone3D initialized.");
          await dicomImageLoaderInit();
          console.log("DICOM Image Loader initialized.");
          console.log("WADO registered for wadouri scheme.");
          await cornerstoneToolsInit();
          console.log("Cornerstone Tools initialized.");
          isCoreInitialized.current = true;
          setIsWadoInitialized(true);
        } catch (err) {
          console.error("Initialization failed:", err);
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
    addTool(AngleTool);
    addTool(CircleROITool);
    addTool(EllipticalROITool);
    addTool(RectangleROITool);
    addTool(PlanarRotateTool);
    console.log("Tools registered.");
  }, []);

  // Process DICOM files and group by series
  useEffect(() => {
    console.log("Processing files, series count:", seriesList.length);
    const processFiles = async () => {
      const seriesMap = new Map<string, Series>();
      const errors: string[] = [];

      for (const file of files) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const byteArray = new Uint8Array(arrayBuffer);
          const dataset = dicomParser.parseDicom(byteArray);

          const seriesInstanceUID =
            dataset.string("x0020000E") ||
            `folder-${file.webkitRelativePath.split("/")[1] || "unknown"}`;
          const seriesNumber = dataset.intString("x00200011") || 0;
          const modality = dataset.string("x00080060") || "OT";
          const transferSyntax =
            dataset.string("x00020010") || "1.2.840.10008.1.2.1";
          const blobUrl = URL.createObjectURL(file);
          const imageId = `wadouri:${blobUrl}`;

          // Log key DICOM tags
          const tags: Record<string, any> = {
            transferSyntax,
            photometric: dataset.string("x00280004"),
            bitsAllocated: dataset.uint16("x00280100"),
            pixelRepresentation: dataset.uint16("x00280103"),
            modality,
            samplesPerPixel: dataset.uint16("x00280002"),
            rows: dataset.uint16("x00280010"),
            columns: dataset.uint16("x00280011"),
            windowCenter: dataset.string("x00281050"),
            windowWidth: dataset.string("x00281051"),
          };
          console.log(`DICOM Tags for ${file.name}:`, tags);

          // Store metadata
          metadataMapRef.current.set(imageId, {
            transferSyntax: { TransferSyntaxUID: transferSyntax },
            instanceNumber: dataset.intString("x00200013") || 0,
            modality,
            studyInstanceUID: dataset.string("x0020000D") || "",
            seriesInstanceUID,
            patientName: dataset.string("x00100010") || "Unknown",
            patientID: dataset.string("x00100020") || "Unknown",
            studyID: dataset.string("x00200010") || "Unknown",
            studyDate: dataset.string("x00080020") || "Unknown",
            institutionName: dataset.string("x00080080") || "Unknown",
            windowCenter: dataset.string("x00281050"),
            windowWidth: dataset.string("x00281051"),
            imagePixelModule: {
              samplesPerPixel:
                dataset.uint16("x00280002") ||
                (dataset.string("x00280004")?.includes("MONOCHROME") ? 1 : 3),
              rows: dataset.uint16("x00280010") || 512,
              columns: dataset.uint16("x00280011") || 512,
              bitsAllocated: dataset.uint16("x00280100") || 8,
              bitsStored: dataset.uint16("x00280101") || 8,
              highBit: dataset.uint16("x00280102") || 7,
              photometricInterpretation:
                dataset.string("x00280004") || "YBR_FULL_422",
              pixelRepresentation: dataset.uint16("x00280103") || 0,
            },
            generalSeriesModule: {
              modality,
              seriesInstanceUID,
              seriesNumber,
            },
          });

          // Group by series
          if (!seriesMap.has(seriesInstanceUID)) {
            seriesMap.set(seriesInstanceUID, {
              seriesInstanceUID,
              seriesNumber,
              modality,
              imageIds: [],
              thumbnail: undefined,
            });
          }
          const series = seriesMap.get(seriesInstanceUID)!;
          series.imageIds.push(imageId);

          // Set thumbnail for first image
          if (series.imageIds.length === 1) {
            try {
              const image = await imageLoader.loadAndCacheImage(imageId);
              const canvas = document.createElement("canvas");
              canvas.width = 100;
              canvas.height = 100;
              const ctx = canvas.getContext("2d")!;
              const pixelData = image.getPixelData();
              const { rows, columns, photometricInterpretation } =
                metadataMapRef.current.get(imageId).imagePixelModule;
              const imgData = ctx.createImageData(100, 100);
              const scaleX = columns / 100;
              const scaleY = rows / 100;
              for (let y = 0; y < 100; y++) {
                for (let x = 0; x < 100; x++) {
                  const srcX = Math.floor(x * scaleX);
                  const srcY = Math.floor(y * scaleY);
                  const srcIdx =
                    (srcY * columns + srcX) *
                    (photometricInterpretation.includes("MONOCHROME") ? 1 : 3);
                  const dstIdx = (y * 100 + x) * 4;
                  if (photometricInterpretation.includes("MONOCHROME")) {
                    const value = pixelData[srcIdx] || 0;
                    imgData.data[dstIdx] =
                      imgData.data[dstIdx + 1] =
                      imgData.data[dstIdx + 2] =
                        value;
                    imgData.data[dstIdx + 3] = 255;
                  } else {
                    imgData.data[dstIdx] = pixelData[srcIdx] || 0;
                    imgData.data[dstIdx + 1] = pixelData[srcIdx + 1] || 0;
                    imgData.data[dstIdx + 2] = pixelData[srcIdx + 2] || 0;
                    imgData.data[dstIdx + 3] = 255;
                  }
                }
              }
              ctx.putImageData(imgData, 0, 0);
              series.thumbnail = canvas.toDataURL();
              console.log(
                `Thumbnail generated for series ${seriesInstanceUID}`
              );
            } catch (thumbErr) {
              console.error(
                `Failed to generate thumbnail for ${file.name}:`,
                thumbErr
              );
            }
          }

          console.log(
            `Processed ${file.name}: ${imageId}, Series: ${seriesInstanceUID}`
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
        const data = metadataMapRef.current.get(id);
        if (data) {
          if (type === "imagePixelModule" || type === "generalSeriesModule") {
            return data[type];
          }
          return data[type.replace("Module", "")] || undefined;
        }
        return undefined;
      }, 100);

      const sortedSeries = Array.from(seriesMap.values()).sort(
        (a, b) => a.seriesNumber - b.seriesNumber
      );
      setSeriesList(sortedSeries);
      if (sortedSeries.length > 0 && !selectedSeriesUID) {
        setSelectedSeriesUID(sortedSeries[0].seriesInstanceUID);
      }
      if (errors.length > 0) {
        setError(errors.join("\n"));
      } else if (sortedSeries.length === 0) {
        setError("No valid DICOM series loaded.");
      } else {
        setError(null);
      }
    };

    processFiles();

    return () => {
      seriesList.forEach((series) =>
        series.imageIds.forEach((id) => {
          if (id.startsWith("wadouri:")) {
            URL.revokeObjectURL(id.replace("wadouri:", ""));
          }
        })
      );
      metaData.removeProvider((type, id) => true);
      metadataMapRef.current.clear();
    };
  }, [files]);

  // Adjust viewport size before rendering
  useEffect(() => {
    if (
      !viewportRef.current ||
      !containerRef.current ||
      !selectedSeriesUID ||
      !isWadoInitialized
    ) {
      console.log("Viewport size adjustment skipped: missing requirements");
      setIsViewportReady(false);
      return;
    }

    const selectedSeries = seriesList.find(
      (s) => s.seriesInstanceUID === selectedSeriesUID
    );
    const imageId = selectedSeries?.imageIds[currentIndex];
    const imageMetadata = imageId
      ? metadataMapRef.current.get(imageId)
      : undefined;
    const element = viewportRef.current;
    const container = containerRef.current;

    console.log(
      `Viewport size adjustment: selectedSeriesUID=${selectedSeriesUID}, ` +
        `seriesList.length=${
          seriesList.length
        }, hasSelectedSeries=${!!selectedSeries}, ` +
        `hasImageMetadata=${!!imageMetadata}, currentIndex=${currentIndex}, imageId=${imageId}`
    );

    if (imageMetadata && selectedSeries && element && container && imageId) {
      const { rows, columns } = imageMetadata.imagePixelModule;
      const aspectRatio = columns / rows;
      const containerAspect = container.clientWidth / container.clientHeight;

      let width, height;
      if (aspectRatio > containerAspect) {
        width = container.clientWidth * VIEWPORT_SCALE;
        height = width / aspectRatio;
      } else {
        height = container.clientHeight * VIEWPORT_SCALE;
        width = height * aspectRatio;
      }

      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      console.log(
        `Viewport size set: ${width}x${height}, Image: ${columns}x${rows}, Aspect: ${aspectRatio}, ` +
          `Container: ${container.clientWidth}x${container.clientHeight}, Scale: ${VIEWPORT_SCALE}`
      );
      setIsViewportReady(true);
    } else {
      console.log(
        "Viewport size not set: invalid series, metadata, or imageId"
      );
      if (selectedSeries && selectedSeries.imageIds.length > 0) {
        // Keep viewport ready if series is valid, to allow stack update
        setIsViewportReady(true);
      } else {
        element.style.width = "0px";
        element.style.height = "0px";
        setIsViewportReady(false);
      }
    }
  }, [isWadoInitialized, seriesList, selectedSeriesUID, currentIndex]);

  // Setup viewport and rendering engine
  useEffect(() => {
    if (
      !viewportRef.current ||
      !containerRef.current ||
      !isCoreInitialized.current ||
      !isWadoInitialized ||
      !isViewportReady
    ) {
      console.log(
        "Skipping viewport setup due to missing refs, initialization, or viewport not ready"
      );
      return;
    }

    console.log("Running viewport setup effect");

    const setupViewport = async () => {
      try {
        const element = viewportRef.current!;
        const renderingEngine =
          renderingEngineRef.current || new RenderingEngine(renderingEngineId);
        renderingEngineRef.current = renderingEngine;
        console.log("RenderingEngine created or reused.");

        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl");
        if (!gl) {
          throw new Error("WebGL is not supported in this browser.");
        }
        console.log("WebGL context available.");

        if (!isViewportEnabled.current) {
          console.log("Enabling viewport...");
          renderingEngine.enableElement({
            viewportId,
            element,
            type: Enums.ViewportType.STACK,
          });
          isViewportEnabled.current = true;

          // Set canvas size to match viewport
          const viewport = renderingEngine.getViewport(
            viewportId
          ) as cornerstone.Types.IStackViewport;
          const canvasElement = viewport.getCanvas();
          canvasElement.width = element.clientWidth;
          canvasElement.height = element.clientHeight;
          canvasElement.style.width = `${element.clientWidth}px`;
          canvasElement.style.height = `${element.clientHeight}px`;
          console.log(
            `Canvas size set: ${canvasElement.width}x${canvasElement.height}, Viewport div: ${element.clientWidth}x${element.clientHeight}`
          );
        }

        const viewport = renderingEngine.getViewport(
          viewportId
        ) as cornerstone.Types.IStackViewport;
        if (!viewport) {
          throw new Error("Failed to retrieve valid viewport instance.");
        }
        console.log("Viewport validated successfully.");

        let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
        if (!toolGroup) {
          console.log("Creating tool group...");
          toolGroup = ToolGroupManager.createToolGroup(toolGroupId)!;
          toolGroup.addTool(ZoomTool.toolName);
          toolGroup.addTool(WindowLevelTool.toolName);
          toolGroup.addTool(PanTool.toolName);
          toolGroup.addTool(LengthTool.toolName);
          toolGroup.addTool(ArrowAnnotateTool.toolName);
          toolGroup.addTool(AngleTool.toolName);
          toolGroup.addTool(CircleROITool.toolName);
          toolGroup.addTool(EllipticalROITool.toolName);
          toolGroup.addTool(RectangleROITool.toolName);
          toolGroup.addTool(PlanarRotateTool.toolName);
          toolGroup.setToolActive(WindowLevelTool.toolName, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
          });
          toolGroup.addViewport(viewportId, renderingEngineId);
          console.log("Tool group created and configured.");
          toolGroupRef.current = toolGroup;
        }
      } catch (err) {
        console.error("Viewport setup failed:", err);
        setError(
          `Viewport error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    };

    setupViewport();

    return () => {
      console.log("Cleaning up viewport effect...");
      ToolGroupManager.destroyToolGroup(toolGroupId);
      if (renderingEngineRef.current) {
        renderingEngineRef.current.destroy();
        renderingEngineRef.current = null;
        isViewportEnabled.current = false;
      }
    };
  }, [isWadoInitialized, isViewportReady]);

  // Update stack for selected series
  useEffect(() => {
    if (
      !renderingEngineRef.current ||
      !viewportRef.current ||
      !selectedSeriesUID ||
      !isWadoInitialized ||
      !isViewportReady
    ) {
      console.log(
        "Skipping stack update due to missing engine, viewport, series, WADO initialization, or viewport not ready"
      );
      return;
    }

    const selectedSeries = seriesList.find(
      (s) => s.seriesInstanceUID === selectedSeriesUID
    );
    if (!selectedSeries || selectedSeries.imageIds.length === 0) {
      console.log("No valid series selected or empty imageIds");
      setError("Selected series is invalid or has no images.");
      return;
    }

    console.log("Running stack update, currentIndex:", currentIndex);

    const updateStack = async () => {
      try {
        const renderingEngine = renderingEngineRef.current;
        const viewport = renderingEngine.getViewport(
          viewportId
        ) as cornerstone.Types.IStackViewport;
        if (!viewport) {
          throw new Error("Viewport not valid for stack update.");
        }
        console.log("Viewport validated for stack update.");

        const imageId = selectedSeries.imageIds[currentIndex];
        console.log(`Loading image: ${imageId}`);
        const image = await imageLoader
          .loadAndCacheImage(imageId)
          .catch((err) => {
            throw new Error(
              `LoadAndCacheImage failed: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          });
        console.log("Image loaded:", image);

        const pixelData = image.getPixelData();
        if (!pixelData) {
          throw new Error("No pixel data available for image.");
        }
        console.log("Pixel data sample:", pixelData.slice(0, 10));

        const imageMetadata = {
          transferSyntax:
            metaData.get("transferSyntax", imageId)?.TransferSyntaxUID ||
            "Unknown",
          pixelModule: metaData.get("imagePixelModule", imageId) || {},
          generalSeries: metaData.get("generalSeriesModule", imageId) || {},
          patientName: metaData.get("patientName", imageId) || "Unknown",
          patientID: metaData.get("patientID", imageId) || "Unknown",
          studyID: metaData.get("studyID", imageId) || "Unknown",
          studyDate: metaData.get("studyDate", imageId) || "Unknown",
          seriesInstanceUID:
            metaData.get("seriesInstanceUID", imageId) || "Unknown",
          instanceNumber: metaData.get("instanceNumber", imageId) || 0,
          institutionName:
            metaData.get("institutionName", imageId) || "Unknown",
          windowCenter: metaData.get("windowCenter", imageId),
          windowWidth: metaData.get("windowWidth", imageId),
        };
        setMetadata(imageMetadata);
        console.log("Metadata set:", imageMetadata);

        console.log("Setting stack...");
        await viewport
          .setStack(selectedSeries.imageIds, currentIndex)
          .catch((err) => {
            throw new Error(
              `SetStack failed: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          });
        console.log("Stack set successfully.");

        // Re-apply canvas size after setting stack
        const canvasElement = viewport.getCanvas();
        canvasElement.width = viewportRef.current.clientWidth;
        canvasElement.height = viewportRef.current.clientHeight;
        canvasElement.style.width = `${viewportRef.current.clientWidth}px`;
        canvasElement.style.height = `${viewportRef.current.clientHeight}px`;
        console.log(
          `Canvas re-sized after stack: ${canvasElement.width}x${canvasElement.height}`
        );

        console.log("Computing VOI range...");
        let windowCenter = parseFloat(imageMetadata.windowCenter);
        let windowWidth = parseFloat(imageMetadata.windowWidth);
        const modality = imageMetadata.generalSeries.modality || "OT";
        const photometric =
          imageMetadata.pixelModule.photometricInterpretation || "MONOCHROME2";
        const bitsAllocated = imageMetadata.pixelModule.bitsAllocated || 16;

        if (
          !windowCenter ||
          !windowWidth ||
          isNaN(windowCenter) ||
          isNaN(windowWidth)
        ) {
          switch (photometric) {
            case "MONOCHROME1":
            case "MONOCHROME2":
              if (modality === "CT") {
                windowCenter = 0;
                windowWidth = 400;
              } else if (modality === "MR") {
                windowCenter = 500;
                windowWidth = 1000;
              } else {
                windowCenter = bitsAllocated === 16 ? 2048 : 128;
                windowWidth = bitsAllocated === 16 ? 4096 : 256;
              }
              break;
            case "RGB":
            case "YBR_FULL":
            case "YBR_FULL_422":
              windowCenter = 128;
              windowWidth = 256;
              break;
            case "PALETTE COLOR":
              windowCenter = 128;
              windowWidth = 256;
              break;
            default:
              windowCenter = 128;
              windowWidth = 256;
          }
          console.log(
            `Applied default WC/WW for ${modality}/${photometric}: ${windowCenter}/${windowWidth}`
          );
        }

        const voiRange = {
          lower: windowCenter - windowWidth / 2,
          upper: windowCenter + windowWidth / 2,
        };
        console.log(
          `VOI range applied: ${voiRange.lower} to ${voiRange.upper}`
        );
        viewport.setProperties({ voiRange });

        console.log("Auto-fitting to window...");
        viewport.reset();
        debounceZoom(Math.round(viewport.getZoom() * 100));

        console.log("Rendering viewport...");
        viewport.render();
        console.log("Viewport rendered with imageId:", imageId);

        // Log final canvas dimensions
        console.log(
          `Final canvas dimensions: ${viewport.getCanvas().width}x${
            viewport.getCanvas().height
          }, ` +
            `Viewport div: ${viewportRef.current.clientWidth}x${viewportRef.current.clientHeight}`
        );

        // Force re-render to ensure visibility
        renderingEngine.resize();
      } catch (err) {
        console.error("Stack update failed:", err);
        setError(
          `Failed to load or render image: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    };

    updateStack();
  }, [
    currentIndex,
    selectedSeriesUID,
    seriesList,
    debounceZoom,
    isWadoInitialized,
    isViewportReady,
  ]);

  // Handle resize
  useEffect(() => {
    if (!containerRef.current || !renderingEngineRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (
        viewportRef.current &&
        containerRef.current &&
        renderingEngineRef.current
      ) {
        const selectedSeries = seriesList.find(
          (s) => s.seriesInstanceUID === selectedSeriesUID
        );
        const imageId = selectedSeries?.imageIds[currentIndex];
        const imageMetadata = imageId
          ? metadataMapRef.current.get(imageId)
          : undefined;
        if (imageMetadata && selectedSeries && imageId) {
          const { rows, columns } = imageMetadata.imagePixelModule;
          const aspectRatio = columns / rows;
          const containerAspect =
            containerRef.current.clientWidth /
            containerRef.current.clientHeight;

          let width, height;
          if (aspectRatio > containerAspect) {
            width = containerRef.current.clientWidth * VIEWPORT_SCALE;
            height = width / aspectRatio;
          } else {
            height = containerRef.current.clientHeight * VIEWPORT_SCALE;
            width = height * aspectRatio;
          }

          viewportRef.current.style.width = `${width}px`;
          viewportRef.current.style.height = `${height}px`;

          // Update canvas size
          const viewport = renderingEngineRef.current.getViewport(
            viewportId
          ) as cornerstone.Types.IStackViewport;
          if (viewport) {
            const canvasElement = viewport.getCanvas();
            canvasElement.width = viewportRef.current.clientWidth;
            canvasElement.height = viewportRef.current.clientHeight;
            canvasElement.style.width = `${viewportRef.current.clientWidth}px`;
            canvasElement.style.height = `${viewportRef.current.clientHeight}px`;
            console.log(
              `Viewport resized: ${viewportRef.current.clientWidth}x${viewportRef.current.clientHeight}, ` +
                `Image: ${columns}x${rows}, Aspect: ${aspectRatio}, ` +
                `Container: ${containerRef.current.clientWidth}x${containerRef.current.clientHeight}, ` +
                `Canvas: ${canvasElement.width}x${canvasElement.height}, Scale: ${VIEWPORT_SCALE}`
            );
            renderingEngineRef.current.resize();
            viewport.render();
            debounceZoom(Math.round(viewport.getZoom() * 100));
          }
        } else {
          console.log("Resize skipped: invalid series, metadata, or imageId");
          if (!selectedSeries || selectedSeries?.imageIds.length === 0) {
            viewportRef.current.style.width = "0px";
            viewportRef.current.style.height = "0px";
          }
        }
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [debounceZoom, selectedSeriesUID, currentIndex, seriesList]);

  // Update active tool
  useEffect(() => {
    if (toolGroupRef.current && activeTool) {
      console.log("Updating active tool:", activeTool);
      const viewport = renderingEngineRef.current?.getViewport(
        viewportId
      ) as cornerstone.Types.IStackViewport;
      if (!viewport) {
        console.warn("Viewport not valid, skipping tool activation.");
        return;
      }

      const tools = [
        ZoomTool.toolName,
        WindowLevelTool.toolName,
        PanTool.toolName,
        LengthTool.toolName,
        ArrowAnnotateTool.toolName,
        AngleTool.toolName,
        CircleROITool.toolName,
        EllipticalROITool.toolName,
        RectangleROITool.toolName,
        PlanarRotateTool.toolName,
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

      const handleInteraction = () => {
        debounceZoom(Math.round(viewport.getZoom() * 100));
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
  }, [activeTool, debounceZoom]);

  // Tool activation handlers
  const activateTool = useCallback((toolName: string) => {
    const viewport = renderingEngineRef.current?.getViewport(
      viewportId
    ) as cornerstone.Types.IStackViewport;
    if (!viewport) {
      console.warn("Cannot activate tool: Viewport not valid.");
      return;
    }
    setActiveTool(toolName);
  }, []);

  // Fit to window
  const fitToWindow = useCallback(() => {
    const viewport = renderingEngineRef.current?.getViewport(
      viewportId
    ) as cornerstone.Types.IStackViewport;
    if (viewport) {
      const selectedSeries = seriesList.find(
        (s) => s.seriesInstanceUID === selectedSeriesUID
      );
      const imageId = selectedSeries?.imageIds[currentIndex];
      const imageMetadata = imageId
        ? metadataMapRef.current.get(imageId)
        : undefined;
      if (imageMetadata && selectedSeries && imageId) {
        const { rows, columns } = imageMetadata.imagePixelModule;
        const scale =
          Math.min(
            viewportRef.current.clientWidth / columns,
            viewportRef.current.clientHeight / rows
          ) * VIEWPORT_SCALE;
        viewport.setZoom(scale);
        viewport.resetCamera();
        debounceZoom(Math.round(viewport.getZoom() * 100));
        viewport.render();
        console.log(
          `Fit to window applied, zoom: ${viewport.getZoom()}, scale: ${scale}`
        );
      }
    }
  }, [debounceZoom, selectedSeriesUID, currentIndex, seriesList]);

  // Actual size
  const actualSize = useCallback(() => {
    const viewport = renderingEngineRef.current?.getViewport(
      viewportId
    ) as cornerstone.Types.IStackViewport;
    if (viewport) {
      viewport.setZoom(1.0);
      debounceZoom(100);
      viewport.render();
      console.log("Actual size applied, zoom: 1.0");
    }
  }, [debounceZoom]);

  // Custom scrolling with throttle
  const handleScroll = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      const now = Date.now();
      if (now - lastScrollTime.current < 300) return;
      lastScrollTime.current = now;

      const direction = Math.sign(event.deltaY);
      const selectedSeries = seriesList.find(
        (s) => s.seriesInstanceUID === selectedSeriesUID
      );
      if (!selectedSeries) return;
      const nextIndex = Math.min(
        Math.max(0, currentIndex + direction),
        selectedSeries.imageIds.length - 1
      );

      if (nextIndex !== currentIndex) {
        setCurrentIndex(nextIndex);
        console.log("Scroll to index:", nextIndex);
      }
    },
    [currentIndex, selectedSeriesUID, seriesList]
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
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const selectedSeries = seriesList.find(
        (s) => s.seriesInstanceUID === selectedSeriesUID
      );
      if (!selectedSeries) return;
      if (event.key === "ArrowLeft" && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
        console.log("Navigated to previous image:", currentIndex - 1);
      } else if (
        event.key === "ArrowRight" &&
        currentIndex < selectedSeries.imageIds.length - 1
      ) {
        setCurrentIndex(currentIndex + 1);
        console.log("Navigated to next image:", currentIndex + 1);
      }
    },
    [currentIndex, selectedSeriesUID, seriesList]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Handle series selection
  const handleSeriesSelect = useCallback(
    (seriesUID: string) => {
      const series = seriesList.find((s) => s.seriesInstanceUID === seriesUID);
      if (series && series.imageIds.length > 0) {
        setSelectedSeriesUID(seriesUID);
        setCurrentIndex(0);
        console.log(
          "Selected series:",
          seriesUID,
          "Image count:",
          series.imageIds.length
        );
      } else {
        console.warn("Series not found or empty:", seriesUID);
        setError("Selected series is invalid or has no images.");
      }
    },
    [seriesList]
  );

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
    <div className="h-full flex">
      {/* Sidebar */}
      <div className="w-50 bg-gray-900 text-white flex flex-col overflow-y-auto">
        <div className="p-2 text-sm font-medium border-b border-gray-700">
          Study
        </div>
        {seriesList.map((series) => (
          <div
            key={series.seriesInstanceUID}
            className={`p-2 cursor-pointer hover:bg-gray-700 ${
              selectedSeriesUID === series.seriesInstanceUID
                ? "bg-gray-600"
                : ""
            }`}
            onClick={() => handleSeriesSelect(series.seriesInstanceUID)}
          >
            <div className="text-xs mb-1">Series {series.seriesNumber}</div>
            <div className="text-xs mb-1">{series.modality}</div>
            {series.thumbnail ? (
              <img
                src={series.thumbnail}
                alt="Thumbnail"
                className="w-full h-auto"
              />
            ) : (
              <div className="w-full h-20 bg-gray-800 flex items-center justify-center text-xs">
                No Thumbnail
              </div>
            )}
            <div className="text-xs mt-1">Images: {series.imageIds.length}</div>
          </div>
        ))}
      </div>
      {/* Viewer */}
      <div className="flex-1 flex flex-col">
        <div className="border-b px-4 py-2 flex h-20 gap-2 bg-gray-100">
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
            title="Arrow Annotate"
          >
            <Pen size={20} />
          </Button>
          <Button
            variant={activeTool === AngleTool.toolName ? "default" : "outline"}
            size="icon"
            onClick={() => activateTool(AngleTool.toolName)}
            title="Measure Angle"
          >
            <Ruler size={20} />
          </Button>
          <Button
            variant={
              activeTool === CircleROITool.toolName ? "default" : "outline"
            }
            size="icon"
            onClick={() => activateTool(CircleROITool.toolName)}
            title="Circle Annotation"
          >
            <Circle size={20} />
          </Button>
          <Button
            variant={
              activeTool === EllipticalROITool.toolName ? "default" : "outline"
            }
            size="icon"
            onClick={() => activateTool(EllipticalROITool.toolName)}
            title="Ellipse Annotation"
          >
            <Circle size={20} />
          </Button>
          <Button
            variant={
              activeTool === RectangleROITool.toolName ? "default" : "outline"
            }
            size="icon"
            onClick={() => activateTool(RectangleROITool.toolName)}
            title="Rectangle Annotation"
          >
            <Square size={20} />
          </Button>
          <Button
            variant={
              activeTool === PlanarRotateTool.toolName ? "default" : "outline"
            }
            size="icon"
            onClick={() => activateTool(PlanarRotateTool.toolName)}
            title="Rotate"
          >
            <RotateCw size={20} />
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
          className="flex-1 bg-black relative overflow-hidden flex items-center justify-center"
          style={{ minHeight: "0" }}
        >
          <div
            ref={viewportRef}
            className="relative"
            style={{
              display: "inline-block",
              visibility: isViewportReady ? "visible" : "hidden",
            }}
          >
            {metadata && (
              <>
                <div className="absolute top-2 left-2 text-emerald-500 text-s bg-gray-900 bg-opacity-70 p-1 rounded">
                  <div>Patient: {metadata.patientName || "N/A"}</div>
                  <div>ID: {metadata.patientID || "N/A"}</div>
                </div>
                <div className="absolute top-2 right-2 text-emerald-500 text-s bg-gray-900 bg-opacity-70 p-1 rounded">
                  <div>Date: {metadata.studyDate || "N/A"}</div>
                  <div>Study: {metadata.studyID || "N/A"}</div>
                </div>
                <div className="absolute bottom-2 left-2 text-emerald-500 text-s bg-gray-900 bg-opacity-70 p-1 rounded">
                  <div>
                    Modality: {metadata.generalSeries?.modality || "N/A"}
                  </div>
                  <div>Institution: {metadata.institutionName || "N/A"}</div>
                </div>
                <div className="absolute bottom-2 right-2 text-emerald-500 text-s bg-gray-900 bg-opacity-70 p-1 rounded">
                  <div>
                    Series: {metadata.seriesInstanceUID?.slice(-8) || "N/A"}
                  </div>
                  <div>
                    Image: {currentIndex + 1} /{" "}
                    {seriesList.find(
                      (s) => s.seriesInstanceUID === selectedSeriesUID
                    )?.imageIds.length || 0}
                  </div>
                  <div>
                    WC/WW: {metadata.windowCenter || "N/A"}/
                    {metadata.windowWidth || "N/A"}
                  </div>
                </div>
              </>
            )}
          </div>
          {selectedSeriesUID &&
            seriesList.find((s) => s.seriesInstanceUID === selectedSeriesUID)
              ?.imageIds.length > 1 && (
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
                  {currentIndex + 1} /{" "}
                  {seriesList.find(
                    (s) => s.seriesInstanceUID === selectedSeriesUID
                  )?.imageIds.length || 0}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const selectedSeries = seriesList.find(
                      (s) => s.seriesInstanceUID === selectedSeriesUID
                    );
                    const nextIndex = Math.min(
                      selectedSeries?.imageIds.length - 1 || 0,
                      currentIndex + 1
                    );
                    console.log(
                      "Navigating to next image, currentIndex:",
                      nextIndex
                    );
                    setCurrentIndex(nextIndex);
                  }}
                  disabled={
                    currentIndex ===
                    (seriesList.find(
                      (s) => s.seriesInstanceUID === selectedSeriesUID
                    )?.imageIds.length || 0) -
                      1
                  }
                >
                  <ChevronRight size={20} />
                </Button>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

export default Viewer;
