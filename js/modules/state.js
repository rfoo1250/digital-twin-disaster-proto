/**
 * state.js
 *
 * This module serves as the single source of truth for the entire application.
 * All shared data, like loaded CSVs, user selections, and slider values,
 * is stored and managed here.
 */

const appState = {
  isDataLoaded: false,
  allData: null,
  selectedFips: null,
  originalDataForFips: {},
  interventions: {},
};

/**
 * Updates a value in the central application state and dispatches an event
 * to notify other modules of the change.
 * @param {string} key - The state property to update (e.g., 'selectedFips').
 * @param {*} value - The new value for the property.
 */
function setState(key, value) {
  if (key === 'selectedFips' && appState.selectedFips !== value) {
    appState.interventions = {};
    document.dispatchEvent(new CustomEvent('state:changed', { detail: { key: 'interventions', value: {} } }));
  }

  appState[key] = value;
  
  document.dispatchEvent(new CustomEvent('state:changed', { detail: { key, value } }));

  console.log(`State updated: ${key}`, value);
}

export { appState, setState };

