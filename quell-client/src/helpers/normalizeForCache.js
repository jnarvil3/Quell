/**
 normalizeForCache traverses server response data and creates objects out of responses for cache. Furthermore, it identifies fields that are 'object types' then replaces those array elements with references (helper), creates separate normalized objectes out of replaced elements, and saves all to cache (helper) with unique identifiers (helper)
 */

// TO-DO: update with new style of parseAST, buildFromCache, etc.
//  response data examples
/* 
{
  "data": {
    "USA": {
      "id": "1",
      "name": "Andorra"
    },
    "country": {
      "id": "2",
      "name": "Bolivia"
    }
  }
}

{
  "data": {
    "countries": [
      {
        "id": "1",
        "name": "Andorra"
      },
      {
        "id": "2",
        "name": "Bolivia"
      }
    ]
  }
}

{
  data: {},
  error: {}
}
*/

// const sampleMap = {
//   countries: 'Country',
//   country: 'Country',
//   citiesByCountryId: 'City',
//   cities: 'City',
// }

// const sampleFieldsMap = {
//   cities: 'City'
// }

// TO-DO: check cache format
// do we store nested values or do we store REFs to values
// { id: 1, name: Andorra, cities: [city--1, city--2] }

/** Iterates & recurses over response object & preps data to be sent to cache
 * and sends data to cache
 * responseData: the data from the graphQL response object
 * map: a map of graphQL fields to their corresponding graphQL Types, 
 *   necessary for cache consistency
 * fieldsMap: potentially deprecated?
 * protoField: the prototype object, or a section of the prototype object, 
 *   for accessing arguments, aliases, etc.
 */

// TO-DO: check if error object exists and then break out of function to avoid caching bad data?
// brainstorm general error strategy

function normalizeForCache(responseData, map, protoField, fieldsMap) {
  // iterate over keys in our response data object 
  for (const resultName in responseData) {
    // currentField we are iterating over
    const currField = responseData[resultName];
    // check if the value stored at that key is array 
    if (Array.isArray(currField)) {
      // RIGHT NOW: countries: [{}, {}]
      // GOAL: countries: ["Country--1", "Country--2"]

      // create empty array to store refs
      // ie countries: ["country--1", "country--2"]
      const refList = [];

      // iterate over countries array
      currField.forEach(el => {
        // el1 = {id: 1, name: Andorra}, el2 =  {id: 2, name: Bolivia}
        // for each object
        // "resultName" is key on "map" for our Data Type
        const dataType = map[resultName];

        // grab ID from object we are iterating over
        let fieldID = dataType;
        for (const key in el) {
          // if key is an ID, append to fieldID for caching
          if (key === 'id' || key === '_id' || key === 'ID' || key === 'Id') {
            fieldID += `--${el[key]}`;
            // push fieldID onto refList
            refList.push(fieldID);
          }
        }

        // if object, recurse to add all nested values of el to cache as individual entries
        if (typeof el === 'object') {
          normalizeForCache({ [dataType]: el }, map,  { [dataType]: protoField[resultName][fieldID]});
        }
      })

      sessionStorage.setItem(resultName, JSON.stringify(refList));
    }
    else if (typeof currField === 'object') {
      // temporary store for field properties
      const fieldStore = {};
      
      // if object has id, generate fieldID 
      let fieldID = resultName;

      // iterate over keys in object
      // "id, name, cities"
      for (const key in currField) {
        // if ID, create fieldID
        if (key === 'id' || key === '_id' || key === 'ID' || key === 'Id') {
          fieldID += `--${currField[key]}`;
        }
        fieldStore[key] = currField[key];

        // if object, recurse normalizeForCache assign in that object
        // must also pass in protoFields object to pair arguments, aliases with response
        if (typeof currField[key] === 'object') {
          normalizeForCache({ [key]: currField[key] }, map, { [key]: protoField[resultName][key]});
        }
      }
      // store "current object" on cache in JSON format
      sessionStorage.setItem(fieldID, JSON.stringify(fieldStore));
    }
  }
}


  // WARNING: HERE THERE BE DRAGONS ---------------
  // If query has arguments they are not the response data
  // if current target is Object
  // if (protoArgs) {
  //   // 
  //   // Name of query for ID generation (e.g. "countries")
  //   // replace with iteration
  //   const queryName = Object.keys(response)[0];

  //   // Object type for ID generation ===> "City"
  //   const collectionName = map[queryName];

  //   // Array of objects on the response (cloned version)
  //   const collection = JSON.parse(JSON.stringify(response[queryName]));

  //   if (Array.isArray(collection)) {
  //     // if collection from response is an array / etc: query all cities with argument country_id
  //     let userDefinedIdArg;
  //     for (let fieldName in QuellStore.arguments) {
  //       for (let arg of QuellStore.arguments[fieldName]) {
  //         if (Object.keys(arg)[0].includes('id')) {
  //           userDefinedIdArg = arg;
  //         }
  //       }
  //     }
  //     const referencesToCache = [];
  //     for (const item of collection) {
  //       const itemKeys = Object.keys(item);

  //       for (const key of itemKeys) {
  //         if (Array.isArray(item[key])) {
  //           item[key] = replaceItemsWithReferences(key, item[key], fieldsMap);
  //         }
  //       }
  //       // Write individual objects to cache (e.g. separate object for each single city)
  //       writeToCache(generateId(collectionName, item), item);
  //       referencesToCache.push(generateId(collectionName, item));
  //     }
  //     // Write the array of references to cache (e.g. 'citiesByCountry-1': ['City-1', 'City-2', 'City-3'...])
  //     writeToCache(generateId(queryName, userDefinedIdArg), referencesToCache);
  //   } else {
  //     // if collection from response is an object / etc: query a country with argument id
  //     const itemKeys = Object.keys(collection);

  //     for (const key of itemKeys) {
  //       if (Array.isArray(collection[key])) {
  //         collection[key] = replaceItemsWithReferences(
  //           key,
  //           collection[key],
  //           fieldsMap
  //         );
  //       }
  //     }
  //     // Write individual objects to cache (e.g. separate object for each single city)
  //     writeToCache(generateId(collectionName, collection), collection);
  //   }
  // } else if (args && alias) {
// if (proto.__alias) 
    // also pass in currentField name so we can map alias -> country--1

    /**
     * Can fully cache aliaes by different id,
     * and can build response from cache with previous query with exact aliases
     * (comment out aliaes functionality now)
     */
    // // if collection from response is an object && QuellStore.alias is not null
    // // Name of alias from response object (e.g. "country1" & "country1")
    // for (let alias of Object.keys(response)) {
    //   // Name of query for ID generation (e.g. "country")
    //   const queryName = Object.keys(QuellStore.alias)[0];
    //   // Object type for ID generation ===> "Country"
    //   const collectionName = map[queryName];
    //   // Array of objects on the response (cloned version)
    //   const collection = JSON.parse(JSON.stringify(response[alias]));
    //   if (Array.isArray(collection)) {
    //     // if collection from response is an array / etc: query all cities with argument country_id
    //     for (const item of collection) {
    //       const itemKeys = Object.keys(item);
    //       for (const key of itemKeys) {
    //         if (Array.isArray(item[key])) {
    //           item[key] = replaceItemsWithReferences(key, item[key], fieldsMap);
    //         }
    //       }
    //       // Write individual objects to cache (e.g. separate object for each single city)
    //       writeToCache(generateId(collectionName, item), item);
    //     }
    //   } else {
    //     // if collection from response is an object / etc: query a country with argument id
    //     const itemKeys = Object.keys(collection);
    //     for (const key of itemKeys) {
    //       if (Array.isArray(collection[key])) {
    //         collection[key] = replaceItemsWithReferences(
    //           key,
    //           collection[key],
    //           fieldsMap
    //         );
    //       }
    //     }
    //     // Write individual objects to cache (e.g. separate object for each single city)
    //     writeToCache(generateId(collectionName, collection), collection);
    //   }
    // }
  // } else  {
    // if collection is query to get all / etc: query all countries

    // countries: [{ id, name }, { id, name }, { id, name }, { id, name }, { id, name }]


    // countries: [country--1, country--2, country--3];

    // country--1: {
    //   id
    //   name
    //   cities: [{}, {}, {}]
    //  }

    // Name of query for ID generation (e.g. "countries")
    // always grabs just first response??? hard-coded for only one query
    // "countries"
//     const queryName = Object.keys(response)[0];

//     // Object type for ID generation ===> "Country"
//     const collectionName = map[queryName];
//     // countries: [ Country: { id, name }, { id, name }, { id, name }, { id, name }, { id, name }]

//     // Array of objects on the response (cloned version)
//     // TO-DO: do we mutate response or continue to need it after normalize ForCache?
//     // countries : [{id, name}, {id, name}, {id, name}]
//     const collection = JSON.parse(JSON.stringify(response[queryName]));

//     // countries: [country--1, country--2, country--3, { id, name }, { id, name }]
//     const referencesToCache = [];
//     // Check for nested array (to replace objects with another array of references)
//     for (const item of collection) {

//       // [{id, name, cities: []}, country--2, country--3, { id, name }, { id, name }]
//       // TO-DO: when will this be ANOTHER array right after the first?
//       // better to handle with RECURSION? (so we can grab nested objects as well)
//       // countries : [{ id: 1, name: USA, cities: [] }]
//       const itemKeys = Object.keys(item);

//       // city--1: { id name }

//       // [id, name]
//       for (const key of itemKeys) {
//         if (Array.isArray(item[key])) {
//           (cities, {[]}, map)
//           item[key] = replaceItemsWithReferences(key, item[key], fieldsMap);
//         }
//       }

//       // Write individual objects to cache (e.g. separate object for each single city)
//       // TO-DO: only call generateId once here, it potentially loops through multiple values, so this would be an easy point to save time
//       // item we write to cache is { id, name }
//       // TO-DO: if nested query, it will write the entire nested object in one go, won't go further to get more granular data out
//       // instead we should recurse, replace item with REF (ie city--1, city--2, city--3)
//       writeToCache(generateId(collectionName, item), item);

//       referencesToCache.push(generateId(collectionName, item));
//     }

//     // Write the array of references to cache (e.g. 'Country': ['Country--1', 'Country--2', 'Country--3'...])
//     writeToCache(collectionName, referencesToCache);
//   }
// }

// ============= HELPER FUNCTIONS ============= //

// countries: [{ id, name }, {id, name}, ...] becomes countries: [country--1, country--2, ...]
// Replaces object field types with an array of references to normalized items (elements)
function replaceItemsWithReferences(field, array, fieldsMap) {
  const arrayOfReferences = [];
  const collectionName = fieldsMap[field];

  for (const item of array) {
    writeToCache(generateId(collectionName, item), item);
    arrayOfReferences.push(generateId(collectionName, item));
  }

  return arrayOfReferences;
}

// Create fieldID (key) for cached item
function generateId(collection, item) {
  let userDefinedId;
  for (let key in item) {
    if (key.includes('id') && key !== 'id' && key !== '_id') {
      userDefinedId = item[key];
    }
  }

  const identifier = item.id || item._id || item.ID || userDefinedId || 'uncacheable';
  return collection + '--' + identifier.toString();
}

// Saves item/s to cache and omits any 'uncacheable' items
function writeToCache(key, item) {
  if (!key.includes('uncacheable')) {
    // Store the data entry
    // TO-DO: instead of overwriting item with new setItem call,
    // get item first, merge cache objects, and set new cache object
    sessionStorage.setItem(key, JSON.stringify(item));

    // Start the time out to remove this data entry for cache expiration after saved in session storage for 10 minutes (600 seconds)
    let seconds = 600;
    setTimeout(() => {
      sessionStorage.removeItem(key);
    }, seconds * 1000);
  }
}

module.exports = normalizeForCache;
