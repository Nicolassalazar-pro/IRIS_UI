const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Startup cleanup function
const startupCleanup = () => {
  const uploadsDir = path.join(__dirname, 'uploads');
  
  // Create uploads directory if it doesn't exist
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
    console.log('Created uploads directory');
    return;
  }
  
  // Check for and delete any existing audio file
  const audioPath = path.join(uploadsDir, 'current-audio.mp3');
  if (fs.existsSync(audioPath)) {
    try {
      fs.unlinkSync(audioPath);
      console.log('Cleaned up existing audio file on startup');
    } catch (err) {
      console.error('Error cleaning up file:', err);
    }
  }
};

// Run cleanup at startup
startupCleanup();

app.use(cors());
app.use(express.json());

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    cb(null, 'current-audio.mp3');
  }
});

const upload = multer({ storage: storage });

// Serve uploaded files with appropriate headers
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  // Set headers to prevent caching
  setHeaders: function (res, path) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));

// Endpoint to upload audio file
app.post('/upload-audio', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }
  
  res.json({
    success: true,
    message: 'File uploaded successfully',
    audioUrl: `http://localhost:${port}/uploads/current-audio.mp3`
  });
});

// Endpoint to delete the current audio file after playback
app.post('/delete-audio', (req, res) => {
  const audioPath = path.join(__dirname, 'uploads', 'current-audio.mp3');
  
  fs.access(audioPath, fs.constants.F_OK, (err) => {
    if (err) {
      // File doesn't exist
      return res.status(404).json({
        success: false,
        message: 'No audio file found to delete'
      });
    }
    
    // File exists, try to delete it
    fs.unlink(audioPath, (err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Error deleting audio file',
          error: err.message
        });
      }
      
      res.json({
        success: true,
        message: 'Audio file deleted successfully'
      });
    });
  });
});

// Endpoint to check and clean up any existing audio files
app.get('/cleanup', (req, res) => {
  const audioPath = path.join(__dirname, 'uploads', 'current-audio.mp3');
  
  fs.access(audioPath, fs.constants.F_OK, (err) => {
    if (!err) {
      // File exists, delete it
      fs.unlink(audioPath, (unlinkErr) => {
        if (unlinkErr) {
          return res.status(500).json({ 
            success: false, 
            message: 'Error cleaning up file', 
            error: unlinkErr.message 
          });
        }
        res.json({ success: true, message: 'Cleaned up existing audio file' });
      });
    } else {
      res.json({ success: true, message: 'No existing audio file found' });
    }
  });
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({ status: 'Server is running' });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});