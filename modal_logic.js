// File name: modal_logic.js
// File description: all modal's logics and logistics from simulation.html goes here

// Global variables - use window object to avoid redeclaration errors
window.fipsUpdater = window.fipsUpdater || {};
window.fipsUpdater.csvData = window.fipsUpdater.csvData || [];
window.fipsUpdater.isDataLoaded = window.fipsUpdater.isDataLoaded || false;
// Global variables - inside this file
let fipsRow = null;

// Function to load and parse CSV data using existing global loadCSV function
async function loadCSVData() {
  try {
    // Check if loadCSV function exists
    if (typeof loadCSV !== 'function') {
      console.error('Global loadCSV function not found');
      return;
    }
    
    // Check if CSV data is already loaded globally (common pattern)
    if (window.csvData && window.csvData.length > 0) {
      console.log('Using existing global csvData');
      window.fipsUpdater.csvData = window.csvData;
      window.fipsUpdater.isDataLoaded = true;
      
      // Calculate and set slider maximums
      calculateAndSetSliderMaximums();
      
      // Only update sliders if there's a valid selected FIPS (not null)
      if (window.selectedFips !== null && window.selectedFips !== undefined) {
        updateSlidersForFips(window.selectedFips);
      } else {
        // console.log('CSV data loaded, but no FIPS selected yet');
      }
      return;
    }
    
    // Try different methods to get CSV data
    let csvText = null;
    
    // Method 1: Try window.fs.readFile (if available)
    if (window.fs && typeof window.fs.readFile === 'function') {
      csvText = await window.fs.readFile('data_features.csv', { encoding: 'utf8' });
    }
    // Method 2: Try fetch API
    else {
      try {
        const response = await fetch('data_features.csv');
        if (response.ok) {
          csvText = await response.text();
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (fetchError) {
        console.warn('Fetch failed:', fetchError.message);
        console.log('Waiting for CSV data to be loaded by other means...');
        // Set up a polling mechanism to check for data later
        setupDataPolling();
        return;
      }
    }
    
    if (!csvText) {
      console.warn('No CSV text available, waiting for data to be loaded elsewhere...');
      setupDataPolling();
      return;
    }
    
    // Use the existing global loadCSV function
    const filteredData = await loadCSV(csvText);
    
    // Store the full dataset for FIPS lookups
    window.fipsUpdater.csvData = filteredData.all;
    window.fipsUpdater.filteredData = filteredData;
    window.fipsUpdater.isDataLoaded = true;
    
    console.log('CSV data loaded via global loadCSV function');
    console.log('Available data categories:', Object.keys(filteredData));
    
    // Calculate and set slider maximums
    calculateAndSetSliderMaximums();
    
    // Only update sliders if there's a valid selected FIPS (not null)
    if (window.selectedFips !== null && window.selectedFips !== undefined) {
      updateSlidersForFips(window.selectedFips);
    } else {
      console.log('CSV data loaded, but no FIPS selected yet');
    }
    
  } catch (error) {
    console.error('Error loading CSV data:', error);
    console.log('Falling back to polling for existing data...');
    setupDataPolling();
  }
}

// Function to poll for existing CSV data (fallback method)
function setupDataPolling() {
  const pollInterval = setInterval(() => {
    // Check if data is available in common global variables
    if (window.csvData && window.csvData.length > 0) {
      console.log('Found existing csvData, using it for FIPS updates');
      window.fipsUpdater.csvData = window.csvData;
      window.fipsUpdater.isDataLoaded = true;
      
      // Calculate and set slider maximums
      calculateAndSetSliderMaximums();
      
      clearInterval(pollInterval);
      
      // Update sliders if FIPS is already selected
      if (window.selectedFips !== null && window.selectedFips !== undefined) {
        updateSlidersForFips(window.selectedFips);
      }
    }
    // Check if filteredData is available
    else if (window.filteredData && window.filteredData.all) {
      console.log('Found existing filteredData, using it for FIPS updates');
      window.fipsUpdater.csvData = window.filteredData.all;
      window.fipsUpdater.filteredData = window.filteredData;
      window.fipsUpdater.isDataLoaded = true;
      
      // Calculate and set slider maximums
      calculateAndSetSliderMaximums();
      
      clearInterval(pollInterval);
      
      // Update sliders if FIPS is already selected
      if (window.selectedFips !== null && window.selectedFips !== undefined) {
        updateSlidersForFips(window.selectedFips);
      }
    }
  }, 500); // Check every 500ms
  
  // Stop polling after 10 seconds to avoid infinite polling
  setTimeout(() => {
    clearInterval(pollInterval);
    if (!window.fipsUpdater.isDataLoaded) {
      console.warn('CSV data not found after 10 seconds. FIPS slider updates will not work until data is loaded.');
    }
  }, 10000);
}

// Function to find all data for a specific FIPS code
function findDataForFips(fipsCode) {
  if (!window.fipsUpdater.isDataLoaded || !window.fipsUpdater.csvData) {
    console.warn('CSV data not loaded yet');
    return null;
  }
  
  // Convert fipsCode to number for comparison
  const targetFips = parseInt(fipsCode);
  
  // Find the row with matching FIPS
  const matchingRow = window.fipsUpdater.csvData.find(row => {
    const rowFips = parseInt(row.FIPS);
    return rowFips === targetFips;
  });
  
//   console.log("in findDataForFips");
//   console.log(matchingRow);
    // all ok here!
  fipsRow = matchingRow;
  return matchingRow;
}

// Function to extract concerned data for a specific FIPS code
function extractDataByFIPS(csvData, selectedFips) {
    // Find the entry that matches the selected FIPS code
    // const row = csvData.find(item => item.FIPS === selectedFips);
    // const row = findDataForFips(selectedFips);
    const row = fipsRow;
    // console.log("in extractDatabyFips");
    // console.log(row);
    if (!window.newsColumns || !window.redditColumns || !window.transitionColumns) {
        console.error(`Cannot find newsColumns, redditColumns, and transitionColumns`);
        return null;
    }
    else if (!row) {
        console.error(`No data found for FIPS: ${selectedFips}`);
        return null;
    }

    // Helper to extract a group of columns
    const extractGroup = (columns) => {
        const groupData = {};
        columns.forEach(col => {
            groupData[col] = row[col];
        });
        return groupData;
    };

    return {
        ...extractGroup(window.newsColumns),
        ...extractGroup(window.redditColumns),
        ...extractGroup(window.transitionColumns)
    };
}


// Function to update all sliders based on FIPS data
function updateSlidersForFips(fipsCode) {
  if (!window.fipsUpdater.isDataLoaded) {
    console.warn('CSV data not loaded yet, cannot update sliders');
    return;
  }
  
  const data = findDataForFips(fipsCode);
  
  if (!data) {
    console.warn(`No data found for FIPS code: ${fipsCode}`);
    return;
  }
  
  console.log(`Updating sliders for FIPS: ${fipsCode}`);
  
    // Update News sliders
    // const newsColumns = ['news_trees', 'news_power_lines', 'news_roofs', 'news_buildings', 'news_vehicles', 'news_agriculture', 'news_infrastructure'];
    newsColumns.forEach(columnName => {
        const value = data[columnName];
        const displayName = columnName.replace('News_', '').toLowerCase().replace(' ', '_');
        const sliderName = `news_${displayName}`;
        // console.log("Updating News sliders with values: " + value);
        if (value !== undefined && value !== null) {
          updateSlider(sliderName, value);
        }
      });
      
      // Update Reddit sliders
      // const redditColumns = ['reddit_trees', 'reddit_power_lines', 'reddit_roofs', 'reddit_buildings', 'reddit_vehicles', 'reddit_agriculture', 'reddit_infrastructure'];
      redditColumns.forEach(columnName => {
        const value = data[columnName];
        const displayName = columnName.replace('Reddit_', '').toLowerCase().replace(' ', '_');
        const sliderName = `reddit_${displayName}`;
        // console.log("Updating Reddit sliders with values: " + value);
        if (value !== undefined && value !== null) {
            updateSlider(sliderName, value);
        }
    });

  
  // Update transition sliders with area normalization (if they exist)
  const countyAreaValue = data['county_area_m2'];
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      const column = `transition_${i}_${j}`;
      const originalValue = data[column];
      if (originalValue !== undefined && originalValue !== null) {
        let normalizedValue = originalValue;
        
        // Normalize by county area if available and non-zero
        if (countyAreaValue !== undefined && countyAreaValue !== null && countyAreaValue !== 0) {
          normalizedValue = originalValue / countyAreaValue;
        } else {
          console.warn(`Cannot normalize ${column} for FIPS ${fipsCode}: county_area_m2 is ${countyAreaValue}`);
        }
        
        updateSlider(column, normalizedValue);
      }
    }
  }
}

// Function to calculate column maximums and set slider max values
function calculateAndSetSliderMaximums() {
  if (!window.fipsUpdater.isDataLoaded || !window.fipsUpdater.csvData) {
    console.warn('CSV data not loaded, cannot calculate slider maximums');
    return;
  }
  
  const data = window.fipsUpdater.csvData;
  const padding = 0; // change if needed
  
  // Calculate maximums for News columns
  const newsColumns = ['News_Trees', 'News_Power Lines', 'News_Roofs', 'News_Buildings', 'News_Vehicles', 'News_Agriculture', 'News_Infrastructure'];
  newsColumns.forEach(column => {
    const values = data.map(row => row[column]).filter(val => val !== null && val !== undefined && !isNaN(val));
    if (values.length > 0) {
      const maxValue = Math.max(...values);
      const sliderMax = maxValue + padding;
      const sliderId = `news_${column.split('_')[1].toLowerCase()}`;
      setSliderMaximum(sliderId, sliderMax);
    }
  });
  
  // Calculate maximums for Reddit columns
  const redditColumns = ['Reddit_Trees', 'Reddit_Power Lines', 'Reddit_Roofs', 'Reddit_Buildings', 'Reddit_Vehicles', 'Reddit_Agriculture', 'Reddit_Infrastructure'];
  redditColumns.forEach(column => {
    const values = data.map(row => row[column]).filter(val => val !== null && val !== undefined && !isNaN(val));
    if (values.length > 0) {
      const maxValue = Math.max(...values);
      const sliderMax = maxValue + padding;
      const sliderId = `reddit_${column.split('_')[1].toLowerCase()}`;
      setSliderMaximum(sliderId, sliderMax);
    }
  });
  
  // Calculate maximums for transition columns (with area normalization)
  const transitionMaxValues = {};
  
  // First, collect all normalized transition values
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      const column = `transition_${i}_${j}`;
      const normalizedValues = [];
      
      data.forEach(row => {
        const originalValue = row[column];
        const countyAreaValue = row['county_area_m2'];
        
        if (originalValue !== null && originalValue !== undefined && !isNaN(originalValue)) {
          let normalizedValue = originalValue;
          
          // Apply same normalization logic as in updateSlidersForFips
          if (countyAreaValue !== undefined && countyAreaValue !== null && countyAreaValue !== 0) {
            normalizedValue = originalValue / countyAreaValue;
          }
          
          normalizedValues.push(normalizedValue);
        }
      });
      
      if (normalizedValues.length > 0) {
        const maxValue = Math.max(...normalizedValues);
        const sliderMax = maxValue + padding;
        setSliderMaximum(column, sliderMax);
      }
    }
  }
  
//   console.log('Slider maximums calculated and set with padding of', padding);
}

// Function to set a specific slider's maximum value
function setSliderMaximum(sliderId, maxValue) {
  const slider = document.getElementById(`${sliderId}-slider`);
  if (slider) {
    slider.max = maxValue;
    // console.log(`Set ${sliderId} slider max to: ${maxValue}`);
  } else {
    // console.warn(`Slider not found for maximum setting: ${sliderId}-slider`);
  }
}
function updateSlider(sliderId, value) {
  const slider = document.getElementById(`${sliderId}-slider`);
  const valueDisplay = document.getElementById(`${sliderId}-value`);
  
  if (slider) {
    // Ensure value is within slider bounds
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 1000;
    const clampedValue = Math.max(min, Math.min(max, value));
    
    slider.value = clampedValue;
    
    // Trigger input event to update any listeners
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    console.warn(`Slider not found: ${sliderId}-slider`);
  }
  
  if (valueDisplay) {
    valueDisplay.textContent = value;
  } else {
    console.warn(`Value display not found: ${sliderId}-value`);
  }
}

// Listen for changes to window.selectedFips
// Initialize selectedFips as null if not already set
if (window.selectedFips === undefined) {
  window.selectedFips = null;
}
let lastSelectedFips = null;

function checkForFipsChange() {
  if (window.selectedFips !== lastSelectedFips) {
    lastSelectedFips = window.selectedFips;
    if (window.selectedFips !== null && window.selectedFips !== undefined) {
      console.log(`FIPS changed to: ${window.selectedFips}`);
      updateSlidersForFips(window.selectedFips);
    } else {
      console.log('FIPS is now null/undefined - no sliders updated');
    }
  }
}

// Custom event listener for FIPS changes !!!
document.addEventListener('fipsChanged', function(event) {
  const newFips = event.detail.fips;
  if (newFips !== null && newFips !== undefined) {
    console.log(`FIPS changed via custom event: ${newFips}`);
    updateSlidersForFips(newFips);
    window.original_dict = extractDataByFIPS(newFips);
    // reset interventions for this county
    window.interv_dict = {};
    

    // Assign original dictionary with the function output
    original_dict = extractDataByFIPS(newFips);
    if (!original_dict) {
        console.warn("County did not generate dict from csv!")
    }
    // if not edited, interv_dict remains empty
    
    
    // console.log("New row from new FIPS: ");
    // console.log(original_dict);
    window.original_dict = original_dict;
    window.interv_dict = interv_dict;
    console.log('Original sample:', window.original_dict);
    console.log('Reset interventions:', window.interv_dict);
    
  } else {
    console.log('FIPS set to null via custom event - no sliders updated');
  }
});

// Function to manually trigger FIPS update (for external use)
function setSelectedFips(fipsCode) {
  window.selectedFips = fipsCode;
  updateSlidersForFips(fipsCode);
  
  // Dispatch custom event
  document.dispatchEvent(new CustomEvent('fipsChanged', {
    detail: { fips: fipsCode }
  }));
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, initializing FIPS slider updater...');
  loadCSVData();
  
  // Poll for changes to window.selectedFips every 100ms
  setInterval(checkForFipsChange, 100);
});

// Export functions for external use
window.fipsSliderUpdater = {
  loadCSVData,
  updateSlidersForFips,
  setSelectedFips,
  findDataForFips,
  calculateAndSetSliderMaximums
};