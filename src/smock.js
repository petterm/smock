const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const express = require('express');
const isSubset = require('is-subset');

const app = express();
const logger = {
  warn: (m, err) => console.log(m, err),
  info: (m, err) => console.log(m, err),
  error: (m, err) => console.log(m, err),
};

/**
 * Finds the matching endpoint among the provided endpoints, returns false if there are no matches
 * @param  {Object} req       An Express.js request object
 * @param  {Array} endpoints An array of smock endpoints
 * @return {Object}           A single smock endpoint, or undefined if no matches can be found
 */
const findMatchingEndpoint = (req, endpoints) => {
  const matches = endpoints.filter(endpoint => {
    const valid = endpoint.request && Object.keys(endpoint.request).length;
    let match = true;

    Object.keys(endpoint.request).forEach(key => {
      if (typeof (endpoint.request[key]) === 'object') {
        const set = Object.assign({}, endpoint.request[key]);
        const subset = Object.assign({}, req[key]);
        match = match && isSubset(subset, set);
      } else if (key === 'path') {
        const regexp = RegExp(endpoint.request[key]);
        match = match && regexp.test(req[key]);
      } else {
        match = match && req[key] === endpoint.request[key];
      }
    });

    return match && valid;
  });

  return matches.length ? matches[0] : undefined;
};

/**
 * Fetches the response object for the smock object matching the incoming request, or undefined
 * if there is no response matching the incoming request.
 * @param  {Object} req An Express request object
 * @return {Object}     A smock response object
 */
const loadScenario = req => {
  const scenarioPath = process.env.SMOCK_PATH;
  let response;

  try {
    const scenarioModule = req.query.scenario || 'default';
    const scenario = require(`${scenarioPath}/${scenarioModule}`);
    const endpoints = scenario.endpoints;

    response = findMatchingEndpoint(req, endpoints);
  } catch (err) {
    logger.warn('Scenario server error:', err);
  }

  return response;
};

/**
 * Parse response data from endpoint
 * @param  {Object} req       An Express.js request object
 * @param  {Object} endpoint  A smock response object
 * @return {Object}           Response data for the matching request
 */
const responseData = (req, endpoint) => {
  if (typeof(endpoint.response.data) === 'function') {
    return endpoint.response.data(req);
  }
  return endpoint.response.data || 'OK';
};

app.use(bodyParser.json());
app.use(cookieParser());

app.all('*', (req, res) => {
  let respond;
  let scenario = loadScenario(req);

  // Allow CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS, DELETE');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // For now, just respond with a 200 to potential pre-flight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).send();
  }

  if (scenario) {
    respond = () => {
      const cookies = scenario.response.cookies || {};
      Object.keys(cookies).forEach(key => res.cookie(key, cookies[key]));
      return res.status(scenario.response.status || 200).send(responseData(req, scenario));
    };

    logger.info(`Scenario found for ${req.method} ${req.path}`);
  } else { // eslint-disable-line
    respond = () => res.status(500).send('No endpoint match found!');

    logger.warn(`No matching scenario for ${req.method} ${req.path}`);
  }

  respond();
});

module.exports = app;
