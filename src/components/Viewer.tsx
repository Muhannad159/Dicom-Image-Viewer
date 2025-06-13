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
  Download,
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
  fileData?: {
    files: File[];
    uploadType: "single" | "multiple" | "series" | "study";
    seriesGroups: Map<string, File[]>;
  };
}

function Viewer({ fileData }: ViewerProps) {
  if (!fileData) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 p-4">
        <h3 className="text-lg font-medium mb-2">No Files Uploaded</h3>
        <p className="text-sm">
          Please upload DICOM files or a folder to view.
        </p>
      </div>
    );
  }

  const { files, uploadType, seriesGroups } = fileData;
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

  const TOOLS = [
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

  // Initialize Cornerstone
  useEffect(() => {
    const initializeCore = async () => {
      if (!isCoreInitialized.current) {
        try {
          await coreInit();
          await dicomImageLoaderInit({
            maxWebWorkers: navigator.hardwareConcurrency || 1,
            codecsPath: "/codecs.js",
          });
          await cornerstoneToolsInit();
          isCoreInitialized.current = true;
          setIsWadoInitialized(true);
          console.log("Cornerstone initialized");
        } catch (err) {
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
    TOOLS.forEach(addTool);
  }, []);

  // Generate thumbnail
  const generateThumbnail = async (imageId: string, series: Series) => {
    try {
      const image = await imageLoader.loadAndCacheImage(imageId);
      const pixelData = image.getPixelData();
      if (!pixelData) {
        console.warn(`No pixel data for thumbnail: ${imageId}`);
        return;
      }
      const { rows, columns, photometricInterpretation } =
        metadataMapRef.current.get(imageId).imagePixelModule;

      // Normalize pixel data for better contrast
      let min = pixelData[0],
        max = pixelData[0];
      for (let i = 0; i < pixelData.length; i++) {
        min = Math.min(min, pixelData[i]);
        max = Math.max(max, pixelData[i]);
      }
      const range = max - min || 1;

      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext("2d")!;
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
            const value = ((pixelData[srcIdx] - min) / range) * 255;
            imgData.data[dstIdx] =
              imgData.data[dstIdx + 1] =
              imgData.data[dstIdx + 2] =
                value;
            imgData.data[dstIdx + 3] = 255;
          } else {
            imgData.data[dstIdx] = ((pixelData[srcIdx] - min) / range) * 255;
            imgData.data[dstIdx + 1] =
              ((pixelData[srcIdx + 1] - min) / range) * 255;
            imgData.data[dstIdx + 2] =
              ((pixelData[srcIdx + 2] - min) / range) * 255;
            imgData.data[dstIdx + 3] = 255;
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
      series.thumbnail = canvas.toDataURL();
    } catch (err) {
      console.error(`Failed to generate thumbnail for ${imageId}:`, err);
    }
  };

  // Process files
  useEffect(() => {
    const processFiles = async () => {
      const seriesMap = new Map<string, Series>();
      const errors: string[] = [];

      for (const [groupKey, groupFiles] of seriesGroups) {
        const seriesInstanceUID = groupKey;
        let series: Series = seriesMap.get(seriesInstanceUID) || {
          seriesInstanceUID,
          seriesNumber: seriesMap.size + 1,
          modality: "OT",
          imageIds: [],
        };

        for (const file of groupFiles) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const byteArray = new Uint8Array(arrayBuffer);
            const dataset = dicomParser.parseDicom(byteArray);
            const transferSyntax =
              dataset.string("x00020010") || "1.2.840.10008.1.2.1";
            const imageId = `wadouri:${URL.createObjectURL(file)}`;
            const modality = dataset.string("x00080060") || "OT";
            series.modality = modality;
            metadataMapRef.current.set(imageId, {
              seriesInstanceUID,
              seriesNumber: series.seriesNumber,
              modality,
              transferSyntax,
              patientID: dataset.string("x00100020") || "Unknown",
              patientName: dataset.string("x00100010") || "Unknown",
              studyDate: dataset.string("x00080020") || "Unknown",
              seriesDescription: dataset.string("x0008103E") || "Unknown",
              sliceLocation: dataset.string("x00201041") || "Unknown",
              instanceNumber: dataset.intString("x00200013") || 0,
              windowCenter: dataset.string("x00281050"),
              windowWidth: dataset.string("x00281051"),
              imagePixelModule: {
                rows: dataset.uint16("x00280010") || 512,
                columns: dataset.uint16("x00280011") || 512,
                photometricInterpretation:
                  dataset.string("x00280004") || "MONOCHROME2",
                bitsAllocated: dataset.uint16("x00280100") || 16,
                bitsStored: dataset.uint16("x00280101") || 16,
                pixelRepresentation: dataset.uint16("x00280103") || 0,
              },
            });

            series.imageIds.push(imageId);

            if (
              (uploadType === "single" && series.imageIds.length === 1) ||
              (uploadType === "multiple" && series.imageIds.length === 1) ||
              (uploadType === "series" && series.imageIds.length === 1) ||
              (uploadType === "study" && series.imageIds.length === 1)
            ) {
              await generateThumbnail(imageId, series);
            }
          } catch (err) {
            errors.push(
              `Failed to process ${file.name}: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }

        if (series.imageIds.length > 0) {
          seriesMap.set(seriesInstanceUID, series);
        }
      }

      metaData.addProvider((type, id) => {
        const data = metadataMapRef.current.get(id);
        return data ? data[type] || undefined : undefined;
      }, 100);

      const sortedSeries = Array.from(seriesMap.values()).sort(
        (a, b) => a.seriesNumber - b.seriesNumber
      );
      setSeriesList(sortedSeries);
      if (sortedSeries.length > 0 && !selectedSeriesUID) {
        setSelectedSeriesUID(sortedSeries[0].seriesInstanceUID);
        setCurrentIndex(0);
        setTimeout(() => {
          window.dispatchEvent(new Event("resize"));
          console.log(
            "Initial series selected:",
            sortedSeries[0].seriesInstanceUID,
            { isViewportReady }
          );
        }, 100);
      }
      setError(
        errors.length > 0
          ? errors.join("\n")
          : sortedSeries.length === 0
          ? "No valid DICOM series loaded."
          : null
      );

      return () => {
        seriesList.forEach((series) =>
          series.imageIds.forEach((id) =>
            URL.revokeObjectURL(id.replace("wadouri:", ""))
          )
        );
        metaData.removeProvider(() => true);
        metadataMapRef.current.clear();
      };
    };

    processFiles();
  }, [files, uploadType, seriesGroups]);

  // Setup and resize viewport
  useEffect(() => {
    if (!viewportRef.current || !containerRef.current || !isWadoInitialized) {
      setIsViewportReady(false);
      return;
    }

    const element = viewportRef.current;
    const container = containerRef.current;
    let renderingEngine = renderingEngineRef.current;

    const setupViewport = async () => {
      if (!renderingEngine) {
        renderingEngine = new RenderingEngine(renderingEngineId);
        renderingEngineRef.current = renderingEngine;
        console.log("RenderingEngine created");
      }

      if (!isViewportEnabled.current) {
        renderingEngine.enableElement({
          viewportId,
          element,
          type: Enums.ViewportType.STACK,
        });
        isViewportEnabled.current = true;
        console.log("Viewport enabled");

        let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
        if (!toolGroup) {
          toolGroup = ToolGroupManager.createToolGroup(toolGroupId)!;
          TOOLS.forEach((tool) => toolGroup.addTool(tool.toolName));
          toolGroup.setToolActive(activeTool, {
            bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
          });
          toolGroup.addViewport(viewportId, renderingEngineId);
          toolGroupRef.current = toolGroup;
          console.log("ToolGroup created");
        }
      }
      // Set ready earlier to trigger initial render
      setIsViewportReady(true);
    };

    const updateSize = () => {
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
        const containerAspect = container.clientWidth / container.clientHeight;

        let width = container.clientWidth * VIEWPORT_SCALE;
        let height = width / aspectRatio;
        if (aspectRatio < containerAspect) {
          height = container.clientHeight * VIEWPORT_SCALE;
          width = height * aspectRatio;
        }

        element.style.width = `${width}px`;
        element.style.height = `${height}px`;

        if (renderingEngine) {
          const viewport = renderingEngine.getViewport(
            viewportId
          ) as cornerstone.Types.IStackViewport;
          if (viewport) {
            const canvas = viewport.getCanvas();
            canvas.width = element.clientWidth;
            canvas.height = element.clientHeight;
            canvas.style.width = `${element.clientWidth}px`;
            canvas.style.height = `${element.clientHeight}px`;
            renderingEngine.resize();
            viewport.render();
            setZoomLevel(Math.round(viewport.getZoom() * 100));
            console.log("Viewport resized:", { width, height });
          }
        }
      } else {
        setIsViewportReady(false);
        console.log("Viewport not ready: missing metadata or series");
      }
    };

    setupViewport();
    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      ToolGroupManager.destroyToolGroup(toolGroupId);
      if (renderingEngineRef.current) {
        renderingEngineRef.current.destroy();
        renderingEngineRef.current = null;
        isViewportEnabled.current = false;
      }
    };
  }, [
    isWadoInitialized,
    seriesList,
    selectedSeriesUID,
    currentIndex,
    activeTool,
  ]);

  // Update stack
  useEffect(() => {
    if (
      !renderingEngineRef.current ||
      !viewportRef.current ||
      !selectedSeriesUID ||
      !isViewportReady
    ) {
      console.log("Skipping stack update:", {
        hasRenderingEngine: !!renderingEngineRef.current,
        hasViewport: !!viewportRef.current,
        selectedSeriesUID,
        isViewportReady,
      });
      return;
    }

    const selectedSeries = seriesList.find(
      (s) => s.seriesInstanceUID === selectedSeriesUID
    );
    if (!selectedSeries || selectedSeries.imageIds.length === 0) {
      setError("Selected series is invalid or has no images.");
      return;
    }

    const updateStack = async () => {
      try {
        const viewport = renderingEngineRef.current.getViewport(
          viewportId
        ) as cornerstone.Types.IStackViewport;
        let imageId = selectedSeries.imageIds[currentIndex];
        let image;
        let pixelData;
        let attempts = 0;
        const maxAttempts = selectedSeries.imageIds.length + 1;
        while (attempts < maxAttempts) {
          try {
            image = await imageLoader.loadAndCacheImage(imageId);
            pixelData = image.getPixelData();
            if (!pixelData) {
              throw new Error(`No pixel data available for ${imageId}`);
            }
            break; // Success, exit loop
          } catch (err) {
            console.warn(`Skipping image ${imageId}:`, err);
            attempts++;
            const nextIndex =
              (currentIndex + attempts) % selectedSeries.imageIds.length;
            imageId = selectedSeries.imageIds[nextIndex];
            if (attempts === maxAttempts) {
              throw new Error("No valid images found in series");
            }
          }
        }

        console.log(`Rendering image: ${imageId}`, {
          transferSyntax: metadataMapRef.current.get(imageId)?.transferSyntax,
          photometricInterpretation:
            metadataMapRef.current.get(imageId)?.imagePixelModule
              ?.photometricInterpretation,
          bitsAllocated:
            metadataMapRef.current.get(imageId)?.imagePixelModule
              ?.bitsAllocated,
          bitsStored:
            metadataMapRef.current.get(imageId)?.imagePixelModule?.bitsStored,
          pixelDataLength: pixelData?.length,
        });

        const imageMetadata = {
          patientID: metaData.get("patientID", imageId) || "Unknown",
          patientName: metaData.get("patientName", imageId) || "Unknown",
          studyDate: metaData.get("studyDate", imageId) || "Unknown",
          seriesDescription:
            metaData.get("seriesDescription", imageId) || "Unknown",
          sliceLocation: metaData.get("sliceLocation", imageId) || "Unknown",
          instanceNumber: metaData.get("instanceNumber", imageId) || 0,
          modality: metaData.get("modality", imageId) || "OT",
          windowCenter: metaData.get("windowCenter", imageId),
          windowWidth: metaData.get("windowWidth", imageId),
          pixelModule: metaData.get("imagePixelModule", imageId) || {},
        };
        setMetadata(imageMetadata);

        await viewport.setStack(selectedSeries.imageIds, currentIndex);

        const canvas = viewport.getCanvas();
        canvas.width = viewportRef.current.clientWidth;
        canvas.height = viewportRef.current.clientHeight;
        canvas.style.width = `${viewportRef.current.clientWidth}px`;
        canvas.style.height = `${viewportRef.current.clientHeight}px`;

        let windowCenter = parseFloat(imageMetadata.windowCenter);
        let windowWidth = parseFloat(imageMetadata.windowWidth);
        if (isNaN(windowCenter) || isNaN(windowWidth)) {
          windowCenter = 128;
          windowWidth = 256;
        }

        viewport.setProperties({
          voiRange: {
            lower: windowCenter - windowWidth / 2,
            upper: windowCenter + windowWidth / 2,
          },
        });

        viewport.reset();
        setZoomLevel(Math.round(viewport.getZoom() * 100));
        viewport.render();
        console.log(`Stack updated: ${imageId}`);
      } catch (err) {
        console.error(`Failed to update stack at index ${currentIndex}:`, err);
        setError(
          `Failed to render series: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    };

    updateStack();
  }, [currentIndex, selectedSeriesUID, seriesList, isViewportReady]);

  // Update active tool
  useEffect(() => {
    if (toolGroupRef.current && activeTool) {
      const viewport = renderingEngineRef.current?.getViewport(
        viewportId
      ) as cornerstone.Types.IStackViewport;
      if (!viewport) {
        console.log("No viewport available for tool activation");
        return;
      }

      const selectedSeries = seriesList.find(
        (s) => s.seriesInstanceUID === selectedSeriesUID
      );
      if (!selectedSeries || !selectedSeries.imageIds[currentIndex]) {
        console.log("No valid series or image for tool activation");
        return;
      }

      TOOLS.forEach((tool) =>
        toolGroupRef.current.setToolPassive(tool.toolName)
      );
      toolGroupRef.current.setToolActive(activeTool, {
        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
      });

      // Restore stack to prevent image disappearance
      viewport.setStack(selectedSeries.imageIds, currentIndex).then(() => {
        viewport.render();
        console.log(`Tool activated: ${activeTool}, stack restored`);
      });
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
  }, [activeTool, selectedSeriesUID, currentIndex, seriesList]);

  // Export image
  const exportImage = useCallback(() => {
    if (
      !renderingEngineRef.current ||
      !viewportRef.current ||
      !isViewportReady ||
      !metadata
    ) {
      setError("No image loaded to export.");
      return;
    }

    try {
      const viewport = renderingEngineRef.current.getViewport(
        viewportId
      ) as cornerstone.Types.IStackViewport;
      const canvas = viewport.getCanvas();
      const { width, height } = canvas;

      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = width;
      exportCanvas.height = height;
      const ctx = exportCanvas.getContext("2d")!;

      ctx.drawImage(canvas, 0, 0);

      const fontSize = 12;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textBaseline = "top";
      const padding = 4;
      const bgOpacity = 0.7;

      // Top-left: Patient info
      const tlText = [
        `Patient: ${metadata.patientName || "N/A"}`,
        `ID: ${metadata.patientID || "N/A"}`,
      ];
      const tlWidth =
        Math.max(...tlText.map((t) => ctx.measureText(t).width)) + padding * 2;
      const tlHeight = tlText.length * (fontSize + 2) + padding * 2;
      ctx.fillStyle = `rgba(17, 24, 39, ${bgOpacity})`;
      ctx.fillRect(2, 2, tlWidth, tlHeight);
      ctx.fillStyle = "#10b981";
      tlText.forEach((text, i) =>
        ctx.fillText(text, 2 + padding, 2 + padding + i * (fontSize + 2))
      );

      // Top-right: Study info
      const trText = [
        `Date: ${metadata.studyDate || "N/A"}`,
        `Series: ${metadata.seriesDescription || "N/A"}`,
      ];
      const trWidth =
        Math.max(...trText.map((t) => ctx.measureText(t).width)) + padding * 2;
      const trHeight = trText.length * (fontSize + 2) + padding * 2;
      ctx.fillStyle = `rgba(17, 24, 39, ${bgOpacity})`;
      ctx.fillRect(width - trWidth - 2, 2, trWidth, trHeight);
      ctx.fillStyle = "#10b981";
      trText.forEach((text, i) =>
        ctx.fillText(
          text,
          width - trWidth - 2 + padding,
          2 + padding + i * (fontSize + 2)
        )
      );

      // Bottom-left: Modality info
      const blText = [
        `Modality: ${metadata.modality || "N/A"}`,
        `Location: ${metadata.sliceLocation || "N/A"}`,
      ];
      const blWidth =
        Math.max(...blText.map((t) => ctx.measureText(t).width)) + padding * 2;
      const blHeight = blText.length * (fontSize + 2) + padding * 2;
      ctx.fillStyle = `rgba(17, 24, 39, ${bgOpacity})`;
      ctx.fillRect(2, height - blHeight - 2, blWidth, blHeight);
      ctx.fillStyle = "#10b981";
      blText.forEach((text, i) =>
        ctx.fillText(
          text,
          2 + padding,
          height - blHeight - 2 + padding + i * (fontSize + 2)
        )
      );

      // Bottom-right: Slice and WC/WW
      const brText = [
        `Slice: ${metadata.instanceNumber || "N/A"} / ${
          seriesList.find((s) => s.seriesInstanceUID === selectedSeriesUID)
            ?.imageIds.length || 0
        }`,
        `WC/WW: ${metadata.windowCenter || "N/A"}/${
          metadata.windowWidth || "N/A"
        }`,
      ];
      const brWidth =
        Math.max(...brText.map((t) => ctx.measureText(t).width)) + padding * 2;
      const brHeight = brText.length * (fontSize + 2) + padding * 2;
      ctx.fillStyle = `rgba(17, 24, 39, ${bgOpacity})`;
      ctx.fillRect(
        width - brWidth - 2,
        height - brHeight - 2,
        brWidth,
        brHeight
      );
      ctx.fillStyle = "#10b981";
      brText.forEach((text, i) =>
        ctx.fillText(
          text,
          width - brWidth - 2 + padding,
          height - brHeight - 2 + padding + i * (fontSize + 2)
        )
      );

      const patientID =
        metadata.patientID?.replace(/[^a-zA-Z0-9]/g, "_") || "Unknown";
      const seriesUID =
        metadata.seriesDescription?.replace(/[^a-zA-Z0-9]/g, "_") || "Unknown";
      const filename = `${patientID}_${seriesUID}_Image${currentIndex + 1}.png`;

      const link = document.createElement("a");
      link.href = exportCanvas.toDataURL("image/png");
      link.download = filename;
      link.click();
    } catch (err) {
      setError(
        `Failed to export image: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }, [isViewportReady, metadata, selectedSeriesUID, currentIndex, seriesList]);

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
          console.log(`Scrolled to index: ${nextIndex}`);
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
      } else if (
        event.key === "ArrowRight" &&
        currentIndex < selectedSeries.imageIds.length - 1
      ) {
        setCurrentIndex(currentIndex + 1);
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
        setTimeout(() => {
          window.dispatchEvent(new Event("resize"));
          console.log("Series selected:", seriesUID, { isViewportReady });
        }, 100);
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
    <div className="h-full flex flex-col md:flex-row bg-gray-50">
      {/* Sidebar */}
      <div className="w-full md:w-56 lg:w-64 bg-white border-r border-gray-200 flex flex-col h-auto md:h-full">
        <div className="p-3 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wider">
            {uploadType === "single"
              ? "File"
              : uploadType === "multiple"
              ? "Files"
              : uploadType === "series"
              ? "Series"
              : "Study"}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          {seriesList.map((series) => (
            <div
              key={series.seriesInstanceUID}
              className={`p-3 border-b border-gray-100 cursor-pointer transition-colors ${
                selectedSeriesUID === series.seriesInstanceUID
                  ? "bg-blue-50 border-l-4 border-l-blue-500"
                  : "hover:bg-gray-50"
              }`}
              onClick={() => handleSeriesSelect(series.seriesInstanceUID)}
            >
              <div className="flex items-start">
                {series.thumbnail ? (
                  <div className="mr-3 flex-shrink-0">
                    <img
                      src={series.thumbnail}
                      alt="Series thumbnail"
                      className="h-12 w-12 rounded-sm object-cover border border-gray-200"
                    />
                  </div>
                ) : (
                  <div className="mr-3 flex-shrink-0 h-12 w-12 bg-gray-100 rounded-sm border border-gray-200 flex items-center justify-center text-gray-400 text-xs">
                    No Image
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {uploadType === "single" || uploadType === "multiple"
                      ? series.seriesInstanceUID
                      : `Series ${series.seriesNumber}`}
                  </p>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">
                      {series.modality}
                    </span>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                      {series.imageIds.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Toolbar - Compact and organized */}
        <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center overflow-x-auto">
          <div className="flex space-x-1">
            {/* Navigation controls */}
            {selectedSeriesUID &&
              seriesList.find((s) => s.seriesInstanceUID === selectedSeriesUID)
                ?.imageIds.length > 1 && (
                <div className="flex items-center mr-2 border-r border-gray-200 pr-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() =>
                      setCurrentIndex(Math.max(0, currentIndex - 1))
                    }
                    disabled={currentIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="mx-1 text-sm text-gray-600 whitespace-nowrap">
                    {currentIndex + 1} /{" "}
                    {seriesList.find(
                      (s) => s.seriesInstanceUID === selectedSeriesUID
                    )?.imageIds.length || 0}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() =>
                      setCurrentIndex(
                        Math.min(
                          seriesList.find(
                            (s) => s.seriesInstanceUID === selectedSeriesUID
                          )?.imageIds.length - 1 || 0,
                          currentIndex + 1
                        )
                      )
                    }
                    disabled={
                      currentIndex ===
                      (seriesList.find(
                        (s) => s.seriesInstanceUID === selectedSeriesUID
                      )?.imageIds.length || 0) -
                        1
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

            {/* Tool buttons - grouped by functionality */}
            <div className="flex space-x-1">
              {/* View tools */}
              <Button
                variant={activeTool === ZoomTool.toolName ? "default" : "ghost"}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => activateTool(ZoomTool.toolName)}
                title="Zoom"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                variant={activeTool === PanTool.toolName ? "default" : "ghost"}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => activateTool(PanTool.toolName)}
                title="Pan"
              >
                <Hand className="h-4 w-4" />
              </Button>
              <Button
                variant={
                  activeTool === WindowLevelTool.toolName ? "default" : "ghost"
                }
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => activateTool(WindowLevelTool.toolName)}
                title="Window Level/Width"
              >
                <Sliders className="h-4 w-4" />
              </Button>
            </div>

            <div className="border-l border-gray-200 mx-1 h-6"></div>

            {/* Measurement tools */}
            <div className="flex space-x-1">
              <Button
                variant={
                  activeTool === LengthTool.toolName ? "default" : "ghost"
                }
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => activateTool(LengthTool.toolName)}
                title="Measure Length"
              >
                <Ruler className="h-4 w-4" />
              </Button>
              <Button
                variant={
                  activeTool === AngleTool.toolName ? "default" : "ghost"
                }
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => activateTool(AngleTool.toolName)}
                title="Measure Angle"
              >
                <Ruler className="h-4 w-4 transform rotate-45" />
              </Button>
            </div>

            <div className="border-l border-gray-200 mx-1 h-6"></div>

            {/* Annotation tools */}
            <div className="flex space-x-1">
              <Button
                variant={
                  activeTool === ArrowAnnotateTool.toolName
                    ? "default"
                    : "ghost"
                }
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => activateTool(ArrowAnnotateTool.toolName)}
                title="Arrow Annotate"
              >
                <Pen className="h-4 w-4" />
              </Button>
              <Button
                variant={
                  activeTool === CircleROITool.toolName ? "default" : "ghost"
                }
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => activateTool(CircleROITool.toolName)}
                title="Circle Annotation"
              >
                <Circle className="h-4 w-4" />
              </Button>
              <Button
                variant={
                  activeTool === RectangleROITool.toolName ? "default" : "ghost"
                }
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => activateTool(RectangleROITool.toolName)}
                title="Rectangle Annotation"
              >
                <Square className="h-4 w-4" />
              </Button>
            </div>

            <div className="border-l border-gray-200 mx-1 h-6"></div>

            {/* View controls */}
            <div className="flex space-x-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={fitToWindow}
                title="Fit to Window"
              >
                <Maximize className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={actualSize}
                title="Actual Size"
              >
                <Minimize className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => activateTool(PlanarRotateTool.toolName)}
                title="Rotate"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>

            <div className="border-l border-gray-200 mx-1 h-6"></div>

            {/* Export */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={exportImage}
              title="Export Image"
              disabled={!isViewportReady || !selectedSeriesUID}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>

          <div className="ml-auto flex items-center">
            <span className="text-sm text-gray-600 mr-2">
              Zoom: {zoomLevel}%
            </span>
          </div>
        </div>

        {/* Viewport area */}
        <div
          ref={containerRef}
          className="flex-1 bg-gray-100 relative overflow-hidden flex items-center justify-center"
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
                <div className="absolute top-2 left-2 text-sky-500 text-xs bg-black bg-opacity-60 p-1.5 rounded">
                  <div className="font-medium">
                    Patient: {metadata.patientName || "N/A"}
                  </div>
                  <div>ID: {metadata.patientID || "N/A"}</div>
                </div>
                <div className="absolute top-2 right-2 text-sky-500 text-xs bg-black bg-opacity-60 p-1.5 rounded">
                  <div className="font-medium">
                    Date: {metadata.studyDate || "N/A"}
                  </div>
                  <div>Series: {metadata.seriesDescription || "N/A"}</div>
                </div>
                <div className="absolute bottom-2 left-2 text-sky-500 text-xs bg-black bg-opacity-60 p-1.5 rounded">
                  <div className="font-medium">
                    Modality: {metadata.modality || "N/A"}
                  </div>
                  <div>Location: {metadata.sliceLocation || "N/A"}</div>
                </div>
                <div className="absolute bottom-2 right-2 text-sky-500 text-xs bg-black bg-opacity-60 p-1.5 rounded">
                  <div className="font-medium">
                    Slice: {metadata.instanceNumber || "N/A"} /{" "}
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
        </div>
      </div>
    </div>
  );
}

export default Viewer;
