const { parse } = require('graphql/language/parser');
const parseAST = require('./helpers/parseAST');
const normalizeForCache = require('./helpers/normalizeForCache');
const buildFromCache = require('./helpers/buildFromCache');
const createQueryObj = require('./helpers/createQueryObj');
const createQueryStr = require('./helpers/createQueryStr');
const joinResponses = require('./helpers/joinResponses');

// NOTE:
// Map: Query to Object Types map - Get from server or user provided (check introspection)
// https://graphql.org/learn/introspection/
// Fields Map:  Fields to Object Type map (possibly combine with this.map from server-side)

// NOTE: 
// options feature is currently EXPERIMENTAL
// keys beginning with __ are set aside for future development
// defaultOptions provides default configurations so users only have to supply options they want control over
const defaultOptions = {
  // default time that data stays in cache before expires
  __defaultCacheTime: 600,
  // configures type of cache storage used (client-side only)
  __cacheType: 'session',
  // custom field that defines the uniqueID used for caching
  __userDefinedID: null,
};

// MAIN CONTROLLER
async function Quellify(endPoint, query, map, fieldsMap, userOptions) {
  // merge defaultOptions with userOptions
  // defaultOptions will supply any necessary options that the user hasn't specified
  const options = { ...defaultOptions, ...userOptions };

  // Create AST of query
  const AST = parse(query);

  // Create object of "true" values from AST tree (w/ some eventually updated to "false" via buildItem())
  const { prototype, operationType } = parseAST(AST);

  // pass-through for queries and operations that QuellCache cannot handle
  if (operationType === 'unQuellable') {
    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: query }),
    };

    // Execute fetch request with original query
    const responseFromFetch = await fetch(endPoint, fetchOptions);
    const parsedData = await responseFromFetch.json();
    // Return response as a promise
    return new Promise((resolve, reject) => resolve(parsedData));
  } else {
    // if it is "quellable"
    // Check cache for data and build array from that cached data
    const responseFromCache = buildFromCache(prototype, map, null);
    // If no data in cache, the response array will be empty:
    if (responseFromCache.length === 0) {
      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: query }),
      };

      // Execute fetch request with original query
      const responseFromFetch = await fetch(endPoint, fetchOptions);
      const parsedData = await responseFromFetch.json();
      // Normalize returned data into cache
      normalizeForCache(parsedData.data, map, fieldsMap);

      // Return response as a promise
      return new Promise((resolve, reject) => resolve(parsedData));
    };

    // If found data in cache:
    // Create query object from only false prototype fields
    let mergedResponse;
    const queryObject = createQueryObj(prototype);

    // TO-DO: queryName restricts our cache to just the first query
    const queryName = Object.keys(prototype)[0];

    // Partial data in cache:  (i.e. keys in queryObject will exist)
    if (Object.keys(queryObject).length > 0) {
      // Create formal GQL query string from query object
      const newQuery = createQueryStr(queryObject); 
      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: newQuery }),
      };

      // Execute fetch request with new query
      const responseFromFetch = await fetch(endPoint, fetchOptions);
      const parsedData = await responseFromFetch.json();

      // TO-DO: why put it into an array?
      const parsedResponseFromFetch = Array.isArray(parsedData.data[queryName])
        ? parsedData.data[queryName]
        : [parsedData.data[queryName]];

      // TO-DO: look at joinResponses
      // Stitch together cached response and the newly fetched data and assign to variable
      mergedResponse = {
        data: joinResponses(
          responseFromCache,
          parsedResponseFromFetch,
          prototype
        )
      }
    } else {
      // If everything needed was already in cache, only assign cached response to variable
      mergedResponse = responseFromCache;
    }

    // TO-DO: WHAT IS THIS
    // prep mergedResponse to store in the cache
    // merged response should already factor in joinResponses
    if (QuellStore.arguments && !QuellStore.alias) {
      if (mergedResponse.length === 1) {
        mergedResponse = mergedResponse[0];
      }
    } else if (QuellStore.arguments && QuellStore.alias) {
      newMergedReponse = {};
      mergedResponse.forEach(
        (e) => (newMergedReponse[Object.keys(e)[0]] = e[Object.keys(e)[0]])
      );
      mergedResponse = newMergedReponse;
    } else {
      mergedResponse = mergedResponse;
    }

    const formattedMergedResponse = QuellStore.alias
      ? { data: mergedResponse }
      : { data: { [queryName]: mergedResponse } };

    // Cache newly stitched response
    normalizeForCache(formattedMergedResponse.data, map, fieldsMap);

    // normalizeForCache expects data as if it just got back from graphQL like so:
    // {
    //   "data": {
    //     "country": {
    //       "id": "1",
    //       "name": "Andorra"
    //     }
    //   }
    // }
    // need to convert mergedResponse into graphQL response format

    // Return formattedMergedResponse as a promise
    return new Promise((resolve, reject) => resolve(formattedMergedResponse));
  }
}

// const query = `query {
//   countries {
//       id
//       name
//       cities {
//           id
//           name
//           population
//       }
//   }
// }`

// const sampleMap = {
//   countries: 'Country',
//   country: 'Country',
//   citiesByCountryId: 'City',
//   cities: 'City',
// }

// const sampleFieldsMap = {
//   cities: 'City'
// }

// Quellify('/graphQL', query, sampleMap, sampleFieldsMap);


// '/graphQL' - endpoint
// query - query
// sampleMap - map
// sampleFieldsMap - fieldsMap

module.exports = Quellify;
