const { parse } = require('graphql/language/parser');
const parseAST = require('./helpers/parseAST');
const mapGenerator = require('./helpers/mapGenerator');
const {
  lokiClientCache,
  normalizeForLokiCache,
} = require('./helpers/normalizeForLokiCache');
const { buildFromCache, generateCacheID } = require('./helpers/buildFromCache');
const updateProtoWithFragment = require('./helpers/updateProtoWithFragments');

// NOTE:
// options feature is currently EXPERIMENTAL and the intention is to give Quell users the ability to customize cache update policies or to define custom IDs to use as keys when caching data
// keys beginning with __ are set aside for future development
// defaultOptions provides default configurations so users only have to supply options they want control over
const defaultOptions = {
  // default time that data stays in cache before expires
  __defaultCacheTime: 600,
  // configures type of cache storage used (client-side only)
  __cacheType: 'session',
  // custom field that defines the uniqueID used for caching
  __userDefinedID: null,
  // default fetchHeaders, user can overwrite
  headers: {
    'Content-Type': 'application/json',
  },
};

/**
 * Quellify replaces the need for front-end developers who are using GraphQL to communicate with their servers
 * to write fetch requests. Quell provides caching functionality that a normal fetch request would not provide.
 * Quell syntax is similar to fetch requests and it includes the following:
 *    - accepts a user's endpoint and query string as inputs,
 *    - checks sessionStorage and constructs a response based on the requested information,
 *    - reformulates a query for any data not in the cache,
 *    - passes the reformulated query to the server to resolve,
 *    - joins the cached and server responses,
 *    - decomposes the server response and caches any additional data, and
 *    - returns the joined response to the user.
 *  @param {string} endPoint - The address to where requests are sent and processed. E.g. '/graphql'
 *  @param {string} query - The graphQL query that is requested from the client
 *  @param {object} mutationMap - map of mutation that will be used to create mutation object and determine mutation type
 *  @param {object} map - JavaScript object with a key-value pair for every valid root query - type defined in the user's GraphQL schema
 *  @param {object} queryTypeMap - map of queryType that will be used when caching on client cache storage
 *  @param {object} userOptions - JavaScript object with customizable properties (note: this feature is still in development, please see defaultOptions for an example)
 */

async function Quellify(endPoint, query, maps, userOptions = {}) {
  // merge defaultOptions with userOptions
  // defaultOptions will supply any necessary options that the user hasn't specified

  // mapGenerator  is used to generate mutationMap, map and queryTypeMap, these were all required inputs prior to the latest revision.
  const { map, queryTypeMap, mutationMap } = maps;

  const options = { ...defaultOptions, ...userOptions };
  let typeOfOperation = {
    isMutation: false,
    typeOfMutation: '',
  };

  // iterate over map to create all lowercase map for consistent caching
  for (const props in map) {
    const value = map[props].toLowerCase();
    const key = props.toLowerCase();
    delete map[props]; // avoid duplicate properties
    map[key] = value;
  }

  // Create AST based on the input query using the parse method available in the graphQL library (further reading: https://en.wikipedia.org/wiki/Abstract_syntax_tree)
  const AST = parse(query);

  /**
   * parseAST creates a proto object that contains a key for every root query in the user's request. Also, every root query key contains a key for each field requested on that root query, which is assigned the value of "true". The proto object also carries the following details for every root query
   *    __args - arguments the user passed into the query (null if no arguments were given)
   *    __alias - alias the user included in the query (null if no arguments were given)
   *    __type - the type of root query as defined in the GraphQL schema, which could also be found in the map object passed into Quellify
   *    __id - the ID assigned to the query, either by the user or by the database
   * parseAST also creates an operationType that will evaluate to 'unQuellable' if the request is out-of-scope for caching (please see usage notes in the Readme.md for more details).
   * parseAST also creates a frags object that contains any fields that were requested by a user who chose to use fragments in their request
   *  @param {object} AST - Abstract Syntax Tree generated by parsing the input query (please see here for examples -> https://astexplorer.net/)
   *  @param {object} options - JavaScript object defined in defaultOptions if not provided by the developer using Quell
   */

  //create proto, operationType, and frags using parseAST
  const { proto, operationType, frags } = parseAST(AST, options);

  // pass-through for queries and operations that QuellCache cannot handle
  if (operationType === 'unQuellable') {
    const fetchOptions = {
      method: 'POST',
      headers: options.headers,
      body: JSON.stringify({ query: query }),
    };

    // Execute fetch request with original query
    const serverResponse = await fetch(endPoint, fetchOptions);
    const parsedData = await serverResponse.json();

    // Return response as a promise
    return new Promise((resolve, reject) => resolve(parsedData));
  } else if (operationType === 'mutation') {
    //if operationType is mutation

    //if the mutationQuery is not coming from demo, mutation Query can be created using the code below
    //let mutationQuery = createMutationStr(proto);
    // create mutation object using mutationMap and proto created from parseAST;
    typeOfOperation.isMutation = true;
    let mutationObject;

    for (let mutation in mutationMap) {
      if (proto.hasOwnProperty(mutation)) mutationObject = proto[mutation];
    }

    //determine the number of args
    let argsLen = Object.keys(mutationObject.__args).length;

    //if it is add mutation, do below
    if (
      mutationObject.__type.includes('add') ||
      mutationObject.__type.includes('new') ||
      mutationObject.__type.includes('create') ||
      mutationObject.__type.includes('make')
    ) {
      // add mutation
      const fetchOptions = {
        method: 'POST',
        headers: options.headers,
        body: JSON.stringify({ query: query }),
      };

      // Execute fetch request with original query
      const serverResponse = await fetch(endPoint, fetchOptions);
      const parsedData = await serverResponse.json();

      // Normalize returned data into cache
      normalizeForLokiCache(
        parsedData.data,
        queryTypeMap,
        typeOfOperation,
        map,
        proto
      ); //using lokiJS

      // Return response as a promise
      return new Promise((resolve, reject) => resolve({ data: parsedData }));
    } else {
      //update or delete mutation
      let fetchOptions;
      if (argsLen === 1) {
        typeOfOperation.typeOfMutation = 'delete';
        //delete mutation if the number of args is one
        fetchOptions = {
          method: 'POST',
          headers: options.headers,
          body: JSON.stringify({ query: query }),
        };
      } else if (argsLen > 1) {
        typeOfOperation.typeOfMutation = 'update';
        //update mutation if the number of args is more than one
        fetchOptions = {
          method: 'POST',
          headers: options.headers,
          body: JSON.stringify({ query: query }),
        };
      }

      // Execute fetch request with original query
      const serverResponse = await fetch(endPoint, fetchOptions);
      const parsedData = await serverResponse.json();

      normalizeForLokiCache(
        parsedData.data,
        queryTypeMap,
        typeOfOperation,
        map,
        proto
      );

      // no nomarlizeForLokiCache as query will pull out updated cache from server cache;
      // Return response as a promise
      return new Promise((resolve, reject) => resolve({ data: parsedData }));
    }
  } else {
    // if the request is query

    /**
     * updateProtoWithFragment iterates over the fragments provied by a user and converts them into fields with values of true, and saves them to a new prototype object
     *  @param {object} proto - JavaScript object generated by parseAST
     *  @param {object} frags - JavaScript object with a key of the fragment name defined by the user, and properties for each field requested on that fragment
     * check if the user's request included fragments before invoking updateProtoWithFragment
     */

    const prototype =
      Object.keys(frags).length > 0
        ? updateProtoWithFragment(proto, frags)
        : proto;
    // create an array of root queries on the prototype object so that we can differentiate between root queries and fields nested in a root query
    const prototypeKeys = Object.keys(prototype);

    /**
     * buildFromCache searches the cache for data requested from the user and builds cacheResponse based on data in the cache. Fields that are available in the cache will remain true on the prototype object and fields that are not in the cache and therefore need to be fetched from the server, will be toggled to false.
     *  @param {object} prototype - JavaScript object generated by parseAST (or updateProtoWithFragment if the user request included fragments)
     *  @param {array} prototypeKeys - List of root queries requested by the user
     */

    // store data in client cache to cacheResponse using buildFromCache
    // const cacheResponse = buildFromCache(prototype, prototypeKeys);

    // initialize a cacheHasData to false
    let cacheHasData = false;
    /*
    // If no data in cache, the response array will be empty:
    for (const key in cacheResponse.data) {
      // if the current element does have more than 1 key on it, then set cacheHasData to true and break
      if (Object.keys(cacheResponse.data[key]).length > 0) {
        cacheHasData = true;
      }
    }
    */

    let cacheID;
    let specificID;
    let actionQuery;
    for (const typeKey in proto) {
      if (prototypeKeys.includes(typeKey)) {
        cacheID = generateCacheID(prototype[typeKey]);
        specificID = prototype[typeKey].__id;
        actionQuery = typeKey;
      }
    }
 
    //if currField from Cache is an object , go through cache to find the matching value/info
    let dataInLoki = lokiClientCache.find({
      'cacheID.id': `${specificID}`,
    });



    //if currField from Cache is an array , do below logic to get CacheIDArr

    let lokiJS = lokiClientCache.data;
    const cacheIDArr = [],
      cacheArr = [],
      tempArr = [];
    let prevProperty;
    lokiJS.forEach((cachedData) => {
      for (const property in cachedData) {
        if (
          property === 'queryType' &&
          prevProperty === 'cacheKey' &&
          cachedData[property] === cacheID
        ) {
          cacheIDArr.push(cachedData[prevProperty]);
        } else if (
          property === 'queryType' &&
          prevProperty === 'cacheID' &&
          cachedData[property] &&
          cachedData[property] === cacheID
        ) {

          cacheArr.push(cachedData);
        } else {

          prevProperty = property;
        }
      }
    });



    if (cacheIDArr.length > 0) cacheHasData = true;
    if (dataInLoki.length > 0) cacheHasData = true;

    if (!cacheHasData) {

      const fetchOptions = {
        method: 'POST',
        headers: options.headers,
        body: JSON.stringify({ query: query }),
      };
      // Execute fetch request with original query
      const serverResponse = await fetch(endPoint, fetchOptions);
      const parsedData = await serverResponse.json();
      normalizeForLokiCache(
        parsedData.data,
        queryTypeMap,
        typeOfOperation,
        map,
        proto
      );

      // Return response as a promise
      return new Promise((resolve, reject) => resolve({ data: parsedData }));
    }

    if (cacheIDArr.length > 0) {
      cacheIDArr.forEach((ID) => {
        let idx = 0;
        cacheArr.forEach((cached) => {
          for (const property in cached) {
            if (property === 'id' && cached[property] === ID[idx])
              tempArr.push(cached);
          }
          idx += 1;
        });
      });

      const cacheResponse = Object.assign({}, tempArr);

      return new Promise((resolve, reject) => resolve(cacheResponse));
    }

    if (dataInLoki.length > 0) {
      let cacheInfo = dataInLoki[0]['cacheID'];
      let info = { [`${actionQuery}`]: cacheInfo };
      let obj = { data: { data: info } };

      return new Promise((resolve, reject) => resolve(obj));
    }
  }
}

module.exports = { Quellify, lokiClientCache, mapGenerator };
