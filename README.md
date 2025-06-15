# DICOM Viewer

A web-based application for visualizing medical imaging data in DICOM format (.dcm). Upload individual files or folders to view single images, multiple images, series, or studies with an intuitive interface.

## Features

- **File Uploads**:

  - Upload single or multiple `.dcm` files to view individual images or collections.
  - Supports `single` (one file) and `multiple` (several files) upload types.

- **Folder Uploads**:

  - Upload series folders (containing `.dcm` files) or study folders (multiple series folders).
  - Automatically detects `series` (single folder) or `study` (nested folders) upload types.

- **Drag-and-Drop Support**:

  - Drag and drop `.dcm` files onto the File Upload Card.
  - Drag and drop series or study folders onto the Folder Upload Card.

- **User-Friendly Interface**:

  - Clean, centered layout with a header describing the DICOM Viewer.

- **Viewer Tools**:
  - **Zoom and Pan**: Adjust image scale and navigate within images for detailed inspection.
  - **Window/Level Adjustment**: Modify contrast and brightness to enhance image visibility.
  - **Annotations**: Add measurements, markers, or notes to highlight areas of interest.
  - **Image Navigation**: Scroll through multi-image series or studies to review all slices.
  - **Export**: Export your viewport as PNG file.

## Getting Started

1. **Clone the Repository**:
   ```bash
   git clone <https://github.com/Muhannad159/Dicom-Image-Viewer.git>
   cd dicom-image-viewer
   ```
2. **Install Dependencies**:

```bash
npm install
```

3- **Run the Viewer**:

```bash
npm run dev
```
