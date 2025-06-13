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
  const [activeTool, setActiveTool] = useState<string>(
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
  const VIEWPORT_SCALE = 0.9;

  // Initialize Cornerstone
  useEffect(() => {
    const initializeCore = async () => {
      if (!isCoreInitialized.current) {
        try {
          console.log("Initializing Cornerstone3D...");
          await coreInit();
          await dicomImageLoaderInit();
          await cornerstoneToolsInit();
          isCoreInitialized.current = true;
          setIsWadoInitialized(true);
          console.log("Cornerstone3D, DICOM Loader, and Tools initialized.");
        } catch (err) {
          console.error("Initialization failed:", err);
          setError(
            `Initialization failed: ${
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
    const tools = [
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
    ];
    tools.forEach(addTool);
    console.log("Tools registered.");
  }, []);

  // Generate thumbnail for series
  const generateThumbnail = async (imageId: string, series: Series) => {
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
      console.log(`Thumbnail generated for series ${series.seriesInstanceUID}`);
    } catch (err) {
      console.error(`Failed to generate thumbnail for ${imageId}:`, err);
    }
  };

  // Process DICOM files
  useEffect(() => {
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

          // Store minimal metadata
          metadataMapRef.current.set(imageId, {
            transferSyntax: { TransferSyntaxUID: transferSyntax },
            instanceNumber: dataset.intString("x00200013") || 0,
            modality,
            seriesInstanceUID,
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
            generalSeriesModule: { modality, seriesInstanceUID, seriesNumber },
            patientName: dataset.string("x00100010") || "Unknown",
            patientID: dataset.string("x00100020") || "Unknown",
            studyID: dataset.string("x00200010") || "Unknown",
            studyDate: dataset.string("x00080020") || "Unknown",
            institutionName: dataset.string("x00080080") || "Unknown",
          });

          // Group by series
          if (!seriesMap.has(seriesInstanceUID)) {
            seriesMap.set(seriesInstanceUID, {
              seriesInstanceUID,
              seriesNumber,
              modality,
              imageIds: [],
            });
          }
          const series = seriesMap.get(seriesInstanceUID)!;
          series.imageIds.push(imageId);

          // Generate thumbnail for first image
          if (series.imageIds.length === 1) {
            await generateThumbnail(imageId, series);
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

      // Metadata provider
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
      setError(
        errors.length > 0
          ? errors.join("\n")
          : sortedSeries.length === 0
          ? "No valid DICOM series loaded."
          : null
      );

      // Debug metadata keys
      console.log("Metadata keys:", [...metadataMapRef.current.keys()]);
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
      metaData.removeProvider(() => true);
      metadataMapRef.current.clear();
    };
  }, [files]);

  // Adjust viewport size
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
      `Viewport size adjustment: selectedSeriesUID=${selectedSeriesUID}, seriesList.length=${seriesList.length}, ` +
        `hasSelectedSeries=${!!selectedSeries}, hasImageMetadata=${!!imageMetadata}, currentIndex=${currentIndex}, imageId=${imageId}`
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
      console.log("Skipping viewport setup: missing requirements");
      return;
    }

    const setupViewport = async () => {
      try {
        const element = viewportRef.current!;
        const renderingEngine =
          renderingEngineRef.current || new RenderingEngine(renderingEngineId);
        renderingEngineRef.current = renderingEngine;

        if (!isViewportEnabled.current) {
          renderingEngine.enableElement({
            viewportId,
            element,
            type: Enums.ViewportType.STACK,
          });
          isViewportEnabled.current = true;

          const viewport = renderingEngine.getViewport(
            viewportId
          ) as cornerstone.Types.IStackViewport;
          const canvasElement = viewport.getCanvas();
          canvasElement.width = element.clientWidth;
          canvasElement.height = element.clientHeight;
          canvasElement.style.width = `${element.clientWidth}px`;
          canvasElement.style.height = `${element.clientHeight}px`;
          console.log(
            `Canvas size set: ${canvasElement.width}x${canvasElement.height}`
          );
        }

        let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
        if (!toolGroup) {
          toolGroup = ToolGroupManager.createToolGroup(toolGroupId)!;
          const tools = [
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
          ];
          tools.forEach((tool) => toolGroup.addTool(tool.toolName));
          toolGroup.setToolActive(WindowLevelTool.toolName, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
          });
          toolGroup.addViewport(viewportId, renderingEngineId);
          toolGroupRef.current = toolGroup;
          console.log("Tool group configured.");
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
      ToolGroupManager.destroyToolGroup(toolGroupId);
      if (renderingEngineRef.current) {
        renderingEngineRef.current.destroy();
        renderingEngineRef.current = null;
        isViewportEnabled.current = false;
      }
    };
  }, [isWadoInitialized, isViewportReady]);

  // Update stack
  useEffect(() => {
    if (
      !renderingEngineRef.current ||
      !viewportRef.current ||
      !selectedSeriesUID ||
      !isWadoInitialized ||
      !isViewportReady
    ) {
      console.log("Skipping stack update: missing requirements");
      return;
    }

    const selectedSeries = seriesList.find(
      (s) => s.seriesInstanceUID === selectedSeriesUID
    );
    if (!selectedSeries || selectedSeries.imageIds.length === 0) {
      console.log("Invalid series selected");
      setError("Selected series is invalid or has no images.");
      return;
    }

    const updateStack = async () => {
      try {
        const viewport = renderingEngineRef.current.getViewport(
          viewportId
        ) as cornerstone.Types.IStackViewport;
        const imageId = selectedSeries.imageIds[currentIndex];
        console.log(`Loading image: ${imageId}`);

        const image = await imageLoader.loadAndCacheImage(imageId);
        if (!image.getPixelData()) {
          throw new Error("No pixel data available.");
        }

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

        await viewport.setStack(selectedSeries.imageIds, currentIndex);

        // Set canvas size
        const canvasElement = viewport.getCanvas();
        canvasElement.width = viewportRef.current.clientWidth;
        canvasElement.height = viewportRef.current.clientHeight;
        canvasElement.style.width = `${viewportRef.current.clientWidth}px`;
        canvasElement.style.height = `${viewportRef.current.clientHeight}px`;
        console.log(
          `Canvas size: ${canvasElement.width}x${canvasElement.height}`
        );

        // VOI defaults
        const DEFAULT_VOI = {
          CT: { windowCenter: 0, windowWidth: 400 },
          MR: { windowCenter: 500, windowWidth: 1000 },
          MONOCHROME: (bitsAllocated: number) => ({
            windowCenter: bitsAllocated === 16 ? 2048 : 128,
            windowWidth: bitsAllocated === 16 ? 4096 : 256,
          }),
          DEFAULT: { windowCenter: 128, windowWidth: 256 },
        };

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
          if (photometric.includes("MONOCHROME")) {
            if (modality in DEFAULT_VOI) {
              ({ windowCenter, windowWidth } = DEFAULT_VOI[modality]);
            } else {
              ({ windowCenter, windowWidth } =
                DEFAULT_VOI.MONOCHROME(bitsAllocated));
            }
          } else {
            ({ windowCenter, windowWidth } = DEFAULT_VOI.DEFAULT);
          }
          console.log(
            `Applied default WC/WW for ${modality}/${photometric}: ${windowCenter}/${windowWidth}`
          );
        }

        const voiRange = {
          lower: windowCenter - windowWidth / 2,
          upper: windowCenter + windowWidth / 2,
        };
        viewport.setProperties({ voiRange });

        viewport.reset();
        setZoomLevel(Math.round(viewport.getZoom() * 100));
        viewport.render();
        renderingEngineRef.current.resize();

        console.log(`Viewport rendered with imageId: ${imageId}`);
      } catch (err) {
        console.error("Stack update failed:", err);
        setError(
          `Failed to render image: ${err instanceof Error ? err.message : ""}`
        );
      }
    };

    updateStack();
  }, [
    currentIndex,
    selectedSeriesUID,
    seriesList,
    isWadoInitialized,
    isViewportReady,
  ]);

  // Handle resize
  useEffect(() => {
    if (!containerRef.current || !renderingEngineRef.current) return;

    let timeoutRef;
    const handleResize = () => {
      clearTimeout(timeoutRef);
      timeoutRef = setTimeout(() => {
        if (viewportRef.current && containerRef.current) {
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

            let width = containerRef.current.clientWidth * VIEWPORT_SCALE;
            let height = width / aspectRatio;
            if (aspectRatio < containerAspect) {
              height = containerRef.current.clientHeight * VIEWPORT_SCALE;
              width = height * aspectRatio;
            }

            viewportRef.current.style.width = `${width}px`;
            viewportRef.current.style.height = `${height}px`;

            const viewport = renderingEngineRef.current.getViewport(
              viewportId
            ) as cornerstone.Types.IStackViewport;
            if (viewport) {
              const canvasElement = viewport.getCanvas();
              canvasElement.width = viewportRef.current.clientWidth;
              canvasElement.height = viewportRef.current.clientHeight;
              canvasElement.style.width = `${viewportRef.current.clientWidth}px`;
              canvasElement.style.height = `${viewportRef.current.clientHeight}px`;
              renderingEngineRef.current.resize();
              viewport.render();
              setZoomLevel(Math.round(viewport.getZoom() * 100));
              console.log(`Viewport resized: ${width}x${height}`);
            }
          }
        }
      }, 100);
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      clearTimeout(timeoutRef);
    };
  }, [selectedSeriesUID, currentIndex, seriesList]);

  // Update active tool
  // Update the tool activation useEffect
  useEffect(() => {
    if (toolGroupRef.current && activeTool) {
      const viewport = renderingEngineRef.current?.getViewport(
        viewportId
      ) as cornerstone.Types.IStackViewport;
      if (!viewport) return;

      // Get all available tool names
      const allTools = [
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

      // First set all tools to passive
      allTools.forEach((toolName) => {
        toolGroupRef.current.setToolPassive(toolName);
      });

      // Then activate only the selected tool
      toolGroupRef.current.setToolActive(activeTool, {
        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
      });

      console.log(`Tool activated: ${activeTool}, others deactivated`);

      const handleInteraction = () => {
        setZoomLevel(Math.round(viewport.getZoom() * 100));
      };
      const canvas = viewport.getCanvas();
      canvas.addEventListener("mousedown", handleInteraction);
      canvas.addEventListener("wheel", handleInteraction);
      return () => {
        canvas.removeEventListener("mousedown", handleInteraction);
        canvas.removeEventListener("wheel", handleInteraction);
      };
    }
  }, [activeTool]);

  const activateTool = useCallback((toolName: string) => {
    setActiveTool(toolName);
  }, []);

  const fitToWindow = useCallback(() => {
    const viewport = renderingEngineRef.current?.getViewport(
      viewportId
    ) as cornerstone.Types.IStackViewport;
    if (viewport && viewportRef.current) {
      const selectedSeries = seriesList.find(
        (s) => s.seriesInstanceUID === selectedSeriesUID
      );
      const imageId = selectedSeries?.imageIds[currentIndex];
      const imageMetadata = imageId
        ? metadataMapRef.current.get(imageId)
        : undefined;
      if (imageMetadata && selectedSeries) {
        const { rows, columns } = imageMetadata.imagePixelModule;
        const scale =
          Math.min(
            viewportRef.current.clientWidth / columns,
            viewportRef.current.clientHeight / rows
          ) * VIEWPORT_SCALE;
        viewport.setZoom(scale);
        viewport.resetCamera();
        setZoomLevel(Math.round(viewport.getZoom() * 100));
        viewport.render();
        console.log(`Fit to window: zoom=${scale}`);
      }
    }
  }, [selectedSeriesUID, currentIndex, seriesList]);

  const actualSize = useCallback(() => {
    const viewport = renderingEngineRef.current?.getViewport(
      viewportId
    ) as cornerstone.Types.IStackViewport;
    if (viewport) {
      viewport.setZoom(1.0);
      setZoomLevel(100);
      viewport.render();
      console.log("Actual size: zoom=1.0");
    }
  }, []);

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
      if (selectedSeries) {
        const nextIndex = Math.min(
          Math.max(0, currentIndex + direction),
          selectedSeries.imageIds.length - 1
        );
        if (nextIndex !== currentIndex) {
          setCurrentIndex(nextIndex);
          console.log("Scroll to:", nextIndex);
        }
      }
    },
    [currentIndex, selectedSeriesUID, seriesList]
  );

  useEffect(() => {
    const element = viewportRef.current;
    if (element)
      element.addEventListener("wheel", handleScroll, { passive: false });
    return () => element?.removeEventListener("wheel", handleScroll);
  }, [handleScroll]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const selectedSeries = seriesList.find(
        (s) => s.seriesInstanceUID === selectedSeriesUID
      );
      if (!selectedSeries) return;
      if (event.key === "ArrowLeft" && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
        console.log("Previous image:", currentIndex - 1);
      } else if (
        event.key === "ArrowRight" &&
        currentIndex < selectedSeries.imageIds.length - 1
      ) {
        setCurrentIndex(currentIndex + 1);
        console.log("Next image:", currentIndex + 1);
      }
    },
    [currentIndex, selectedSeriesUID, seriesList]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleSeriesSelect = useCallback(
    (seriesUID: string) => {
      const series = seriesList.find((s) => s.seriesInstanceUID === seriesUID);
      if (series && series.imageIds.length > 0) {
        setSelectedSeriesUID(seriesUID);
        setCurrentIndex(0);
        console.log(
          "Selected series:",
          seriesUID,
          "Images:",
          series.imageIds.length
        );
      } else {
        setError("Invalid or empty series selected.");
      }
    },
    [seriesList]
  );

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-red-500 p-4">
        <h3 className="text-lg font-medium mb-2">Error</h3>
        <p className="text-sm whitespace-pre-wrap">{error}</p>
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
            <Maximize size="20" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={actualSize}
            title="Actual Size"
          >
            <Minimize size="20" />
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
                    console.log("Navigating to next image:", nextIndex);
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
