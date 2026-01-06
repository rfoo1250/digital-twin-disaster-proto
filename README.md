# Digital Twin for Disasters

<!-- 🚧 SUMAMARY NEEDED 🚧 -->
## Summary
This project is a Digital Twin platform for disaster modeling and visualization, currently focused on wildfire simulation with an extensible design for future disaster types.

Wildfire simulations are generated using a stochastic cellular automata (SCA) model and represented as GeoTIFF (.tif) raster files. The system integrates Google Earth Engine for geospatial data access, including land cover data from Dynamic World V1, and uses Google Cloud Storage (GCS) for managing simulation and raster outputs.

Simulation results are visualized on an interactive map interface using Leaflet and georaster-layer-for-leaflet for simple implementation of the simulation.

## System Requirements

As of 12/30/2025, this project is run on:
- Windows 10/11
- Python 3.13.5
- Node v25.2.1
- npm 11.6.2

There are yet to have a Linux/MacOS equivalent of the following instructions, the reader will have to experiment for now.

## Running the Demo Locally

### 1. Clone the repository

```bash
# https
git clone https://github.com/rfoo1250/digital-twin-disaster-proto.git
# git
git clone git@github.com:rfoo1250/digital-twin-disaster-proto.git
# goto dir
cd digital-twin-disaster-proto
```

### 2. Install requirements

Before installing anything, it is recommended to keep a healthy environment and use virtual environments.

- For the Python Flask backend:
    - Create a Python virtual environment ([guides](https://docs.python.org/3/library/venv.html)).
    - Install required libraries:
    ```bash
    pip install -r py/requirements.txt
    ```

- For the JavaScript Vite frontend, do:
    - Create a Node virtual environment ([guides](https://github.com/ekalinin/nodeenv)).
    ```bash
    # make sure the package.json file is in the current directory
    npm install
    ```

This project uses Google Earth Engine and Google Cloud Storage services, which explicitly state that authentication is required for a Google account (preferrably a shared, company account, or your personal one that is only for testing).

1. Ensure that you have access to a Google account that is in a project with Google Earth Engine API and Python API, other API services are optional.
2. Create a service account and get its service account key. Please follow [this link](https://docs.cloud.google.com/iam/docs/keys-create-delete#iam-service-account-keys-create-console).
3. Please place the private key into a safe location. For example, `secrets/[key].json`.
4. Add the key to your USER PATH.
4a. You can add it via System Properties > Advanced > Environment Variables > User Variables for User > New... add Variable Name as "GOOGLE_APPLICATION_CREDENTIALS" and paste the path to the key in Variable Path.
4b. or you can add directly via Windows Command Prompt / Powershell
```cmd
# use setx
setx GOOGLE_APPLICATION_CREDENTIALS "C:\path\to\your\service-account-key.json" /M
# close terminal and open a new one to verify
echo %GOOGLE_APPLICATION_CREDENTIALS%
```

It is also recommended to install Google Cloud CLI ([instructions](https://docs.cloud.google.com/sdk/docs/install-sdk)). They have an installer or you can manually perform installation via terminal.

If there is anything missing from these authentication instructions, please reach out to [contacts](#contacts).

### 3. Run the Flask app as a backend

```bash
python py/app.py
```

### 4. Host the client

```bash
npm run dev
```

The following is outdated as of 12/1/2025 but is kept as legacy.
1. Open another terminal and host via Python's HTTP server
```bash
cd Disaster_bench_dashboard
python -m http.server 8000
```

2. Host via VSCode's Live Server extension
- Install and activate Live Server by Ritwick Dey.
- `cd Disaster_bench_dashboard`
- Follow the instructions by the dev to launch a client session.

Then, go to your localhost's port via a web browser.

## Instructions on Digital Twin
To begin running a simulation -
1. You should first see the user interface with a Map and controls. The Map will be the control to where you pinpoint which county to select and also the display of the wildfire simulation.
2. Select a county and click on the "Focus on County" button, this will zoom into the selected county and load the DynamicWorld layer onto the Map.
3. To set an ignition point for the simulation, click on the "Set Ignition Point" button, then immediately towards a point of interest that is on the county of concern (onto the greens in DynamicWorld). You should see a marker on the Map when the igition point is successfully set.
4. To start a simulation, after setting the ignition point on the highlighted county, with enabling the DynamicWorld layer on the Map, click on "Start Simulation" to start simulation.
Note: this will take some time, have a coffee break, the system will send a pop-up when it is done, the Map will automatically display the animation.
5. The simulation should be displayed frame-by-frame on a 1 second interval. Once it is done, there should be a control to go back or move forward on the frames.
Note: zoom in once to see the changes.

On the side note -
1. You can toggle layers by hovering over the collapsed checkbox menu "Base Layers" to view and enable/disable layers that are shown/loaded.
2. The "Reset Focus" button resets the Map view to the initial view and disable the highlight and the DynamicWorld layer.
3. The "Remove Ignition Point" button resets the ignition point to allow selecting a new location point.

1/5/2026 - images needed to illustrate steps

## Technicalities
This project maintains its logs of erros, bugs, and fixes on [Github's internal Issues page](https://github.com/rfoo1250/digital-twin-disaster-proto/issues).

---

### Contacts
Primary contact:
rfoo1@asu.edu
Secondary contact:
svishnu6@asu.edu