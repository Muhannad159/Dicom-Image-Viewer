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
  - Visual feedback with card highlights during drag (emerald for files, blue for folders).

- **User-Friendly Interface**:

  - Clean, centered layout with a header describing the DICOM Viewer.
  - Two responsive cards (File and Folder) in a grid layout, adapting to mobile and desktop screens.
  - Icons for files and folders in circular backgrounds for clear visual cues.
  - Outline buttons with upload or loading indicators for intuitive interaction.

- **Loading Feedback**:

  - Overlay loader appears on cards during file processing, ensuring a minimum 1-second display for visibility.
  - "Processing..." text shown during uploads for user feedback.

- **Error Handling**:
  - Displays clear error messages for invalid files (non-`.dcm`) or empty folders.
  - Example: "Invalid file type detected: file.txt" or "No valid DICOM files found in dropped folder."

## Getting Started

1. **Clone the Repository**:
   ```bash
   git clone <https://github.com/Muhannad159/Dicom-Image-Viewer.git>
   cd dicom-viewer
   ```
2. **Install Dependencies**:

```bash
npm install
```

3- **Run the Viewer**:

```bash
npm run dev
```
