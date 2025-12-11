# RC Car Controller with Backtracking

A modern web-based RC car controller with path recording and automatic backtracking capabilities.

## Features

### 🎮 Movement Controls
- **Forward/Backward**: Drive the RC car forward or backward
- **Left/Right**: Turn the car left or right
- **Stop**: Emergency stop button (red for visibility)

### 📹 Path Recording
- **Start Recording**: Begin recording the car's movement path
- **Stop Recording**: Stop the current recording session
- **Replay Path**: Automatically drive the car back along the recorded path in reverse
- **Clear Path**: Clear all recorded path data

### 🎨 Modern UI Design

The interface features a professional, modern design with:

- **Dark Gradient Background**: Sleek dark blue theme with gradient effects
- **Glass-Morphism Panels**: Semi-transparent panels with backdrop blur
- **Color-Coded Buttons**: 
  - Blue: Movement controls (Forward, Left, Right, Backward)
  - Red: Stop button
  - Green: Start Recording
  - Orange: Stop Recording
  - Purple: Replay Path
  - Gray: Clear Path
- **D-Pad Layout**: Intuitive directional pad for movement controls
- **Animated Indicators**: Pulsing red dot when recording is active
- **Status Panel**: Real-time status display showing:
  - Recording status (ON/OFF)
  - Path steps count
  - Replay status (ACTIVE/OFF)
- **Responsive Design**: Works on desktop and mobile devices
- **Smooth Animations**: Hover effects and button interactions

## Installation

### Prerequisites

```bash
# Install required Python packages
pip install Flask RPi.GPIO waitress
```

### Running the Application

```bash
# Run as root (required for GPIO access)
sudo python3 rc_car_with_backtrack.py
```

The server will start on port 8080. Access it via:
```
http://<raspberry-pi-ip>:8080
```

## GPIO Pin Configuration

The application uses BCM pin numbering:

- **Motor 1** (Left Motor):
  - IN1: GPIO 17
  - IN2: GPIO 27

- **Motor 2** (Right Motor):
  - IN1: GPIO 22
  - IN2: GPIO 23

## Camera Integration

The UI includes a camera feed placeholder. To integrate your camera:

1. Start your rpicam pipeline externally (e.g., rpicam-vid with gstreamer)
2. Update the camera URL in the HTML template if needed
3. The default URL is configured as: `http://192.168.1.1:8554/`

## How Path Recording Works

1. **Recording Phase**:
   - Press "Start Recording" to begin
   - Drive the car using the movement controls
   - Each action and its duration are recorded
   - Press "Stop Recording" when done

2. **Replay Phase**:
   - Press "Replay Path" to activate backtracking
   - The car will automatically drive back along the recorded path in reverse
   - Actions are inverted (forward→backward, left→right)
   - Manual controls are disabled during replay

3. **Path Management**:
   - View the number of recorded steps in real-time
   - Clear the path data to start fresh

## File Structure

- `rc_car_with_backtrack.py` - Main Flask application with GPIO control
- `rc_car_ui_demo.html` - Standalone UI demo (no backend required)

## UI Preview

The `rc_car_ui_demo.html` file provides a fully interactive demo of the UI without requiring Raspberry Pi hardware. Open it in any web browser to:

- Preview the interface design
- Test button interactions
- Simulate recording and replay functionality
- View status updates

## Safety Features

- **Movement Lock**: Thread-safe GPIO operations
- **Replay Protection**: Manual controls disabled during automatic replay
- **Emergency Stop**: Prominent red stop button for quick access
- **Cleanup Handler**: Automatic GPIO cleanup on shutdown

## Browser Compatibility

The UI is tested and works on:
- Modern desktop browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Chrome Mobile)
- Tablets

## Customization

### Changing Colors

Edit the CSS gradients in the HTML template to customize the color scheme:

```css
.btn {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
}
```

### Adjusting Button Layout

Modify the grid template in `.dpad` class to change the control layout.

### Camera Feed Size

Adjust the `max-width` property of `#video` to change the camera feed size.

## Troubleshooting

### GPIO Errors
- Ensure you're running the script with `sudo`
- Verify pin connections match the configured BCM pins
- Check for pin conflicts with other applications

### Camera Feed Not Showing
- Verify the camera URL is correct
- Ensure the camera pipeline is running externally
- Check network connectivity between devices

### Buttons Not Responding
- Check browser console for JavaScript errors
- Verify Flask server is running and accessible
- Test with the demo HTML file first

## License

MIT License - Feel free to use and modify for your projects.

## Contributing

Contributions are welcome! Areas for improvement:
- PWM speed control integration
- Sensor integration for obstacle detection
- Multiple path storage
- Path visualization
- Mobile app wrapper
