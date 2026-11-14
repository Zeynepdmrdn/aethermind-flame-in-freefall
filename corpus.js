/* Single evidence corpus for Flame in Freefall.
   Loaded by index.html (<script src="corpus.js">, works from a local file) and required by server.js,
   so local search and server-side synthesis use exactly the same passages.
   Passage text is quoted from the cited NASA source unless its scope line says it was compiled or lightly edited.
   meta.* values are supported by the passage text or by a stated study fact (checked by the corpus section of tests/run-tests.js). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EVIDENCE_CORPUS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var corpus = {
  "version": 2,
  "pdfBase": "https://ntrs.nasa.gov/api/citations/20240007488/downloads/Saffire%20ICES%202024%20Saffire%20presentation072124small.pdf",
  "studies": {
    "saffire": {
      "name": "Saffire VI",
      "words": "Saffire VI spacecraft fire experiment"
    },
    "flex": {
      "name": "FLEX (cool flames)",
      "words": "FLEX Flame Extinguishment cool flames"
    },
    "sofie": {
      "name": "SoFIE-MIST",
      "words": "SoFIE-MIST Solid Fuel Ignition and Extinction Material Ignition and Suppression Test"
    }
  },
  "typeLabel": {
    "finding": "Reported finding",
    "condition": "Test condition",
    "objective": "Study objective"
  },
  "typeWords": {
    "finding": "reported finding result",
    "condition": "test condition setup",
    "objective": "study objective goal aim"
  },
  "passages": [
    {
      "id": "saffire-01",
      "study": "saffire",
      "type": "finding",
      "text": "The smoke was readily detected at 981 seconds (after most of the hazardous gas release had occurred).",
      "slide": 21,
      "url": "https://ntrs.nasa.gov/citations/20240007488",
      "scope": "Preliminary result from one test (Saffire VI-3, two-sided PMMA)",
      "meta": {
        "tests": ["VI-3"],
        "platform": null,
        "vehicle": "Cygnus",
        "materials": [
          "PMMA"
        ],
        "variables": [
          "smoke detection time",
          "hazardous gas release"
        ]
      }
    },
    {
      "id": "saffire-02",
      "study": "saffire",
      "type": "finding",
      "text": "Ignition at 637 s (annotated on the VI-3 temperature, heat release, and CO and CO2 plots).",
      "slide": 16,
      "url": "https://ntrs.nasa.gov/citations/20240007488",
      "scope": "Preliminary result from one test (Saffire VI-3, two-sided PMMA). Compiled from slide plot annotations, not an exact quote.",
      "slides": [
        16,
        17,
        18
      ],
      "meta": {
        "tests": ["VI-3"],
        "platform": null,
        "vehicle": "Cygnus",
        "materials": [
          "PMMA"
        ],
        "variables": [
          "ignition time"
        ]
      }
    },
    {
      "id": "saffire-03",
      "study": "saffire",
      "type": "condition",
      "text": "Flow reduced at 1120 s. Flow was changed from 20 cm/s to 5 cm/s at 1120 seconds. Duct flow terminated at 1420 seconds.",
      "slide": 16,
      "url": "https://ntrs.nasa.gov/citations/20240007488",
      "scope": "Saffire VI-3 (two-sided PMMA) test. Compiled from slide plot annotations, not an exact quote.",
      "meta": {
        "tests": ["VI-3"],
        "platform": null,
        "vehicle": "Cygnus",
        "materials": [
          "PMMA"
        ],
        "variables": [
          "airflow",
          "flow rate"
        ]
      }
    },
    {
      "id": "saffire-04",
      "study": "saffire",
      "type": "condition",
      "text": "Two-sided PMMA sample, 18 cm long. Air flow rate 20 cm/s, concurrent flow direction. Ambient pressure 54.6 kPa. Oxygen concentration 30.3 mol%. Free volume 16.7 m3.",
      "slide": 11,
      "url": "https://ntrs.nasa.gov/citations/20240007488",
      "scope": "Saffire VI-3 test matrix (as executed). Reformatted from a slide table, not an exact quote.",
      "meta": {
        "tests": ["VI-3"],
        "platform": null,
        "vehicle": "Cygnus",
        "materials": [
          "PMMA"
        ],
        "variables": [
          "airflow",
          "ambient pressure",
          "oxygen concentration",
          "free volume",
          "sample length"
        ]
      }
    },
    {
      "id": "saffire-05",
      "study": "saffire",
      "type": "condition",
      "text": "Sample configuration for Saffire IV & VI includes 2-sided PMMA (1 cm thick) and 1-sided PMMA (0.5 cm thick) samples.",
      "slide": 12,
      "url": "https://ntrs.nasa.gov/citations/20240007488",
      "scope": "Saffire IV and VI sample configurations. Reformatted from slide text, not an exact quote.",
      "meta": {
        "platform": null,
        "vehicle": null,
        "materials": [
          "PMMA"
        ],
        "variables": [
          "sample thickness"
        ]
      }
    },
    {
      "id": "saffire-06",
      "study": "saffire",
      "type": "condition",
      "text": "Practical scale fires ranging from 1.5 to 3.2 kW were tested in unmanned spacecraft with free air volumes of 17 to 19 cubic meters.",
      "slide": 21,
      "url": "https://ntrs.nasa.gov/citations/20240007488",
      "scope": "Conclusions across the Saffire flights summarized in the presentation",
      "meta": {
        "platform": null,
        "vehicle": null,
        "materials": [],
        "variables": [
          "fire size",
          "kW",
          "free volume"
        ]
      }
    },
    {
      "id": "saffire-07",
      "study": "saffire",
      "type": "finding",
      "text": "The temperature only increased significantly very near to the fire itself.",
      "slide": 21,
      "url": "https://ntrs.nasa.gov/citations/20240007488",
      "scope": "Conclusions slide of the presentation",
      "meta": {
        "platform": null,
        "vehicle": null,
        "materials": [],
        "variables": [
          "temperature"
        ]
      }
    },
    {
      "id": "saffire-08",
      "study": "saffire",
      "type": "finding",
      "text": "Ambient concentrations of carbon monoxide exceeded the 24-hour carbon monoxide limit (for PMMA tests). Ambient concentrations of carbon dioxide exceeded the 1-hour carbon dioxide limit (for PMMA tests).",
      "slide": 21,
      "url": "https://ntrs.nasa.gov/citations/20240007488",
      "scope": "As stated on the Conclusions slide, for the PMMA tests (quoted with a typo fixed). This page does not interpret these limits.",
      "meta": {
        "platform": null,
        "vehicle": null,
        "materials": [
          "PMMA"
        ],
        "variables": [
          "carbon monoxide concentration",
          "carbon dioxide concentration"
        ]
      }
    },
    {
      "id": "saffire-09",
      "study": "saffire",
      "type": "finding",
      "text": "The human hazard from a fire in a spacecraft is very similar to terrestrial fires where the heat from the fire is not the principal hazard and rather the smoke and gaseous products are a much greater concern.",
      "slide": 21,
      "url": "https://ntrs.nasa.gov/citations/20240007488",
      "scope": "Authors' conclusion on the Conclusions slide (quoted with a typo fixed)",
      "meta": {
        "platform": null,
        "vehicle": null,
        "materials": [],
        "variables": [
          "hazard",
          "smoke",
          "gaseous products"
        ]
      }
    },
    {
      "id": "saffire-10",
      "study": "saffire",
      "type": "objective",
      "text": "The lack of this experimental data has forced spacecraft designers to base their designs and safety precautions on 1-g understanding of flame spread, flame self-extinguishment, fire detection, and suppression.",
      "slide": null,
      "url": "https://ntrs.nasa.gov/citations/20240007488",
      "scope": "NTRS record abstract",
      "meta": {
        "platform": null,
        "vehicle": null,
        "materials": [],
        "variables": [
          "flame spread",
          "flame self-extinguishment",
          "fire detection",
          "suppression"
        ]
      }
    },
    {
      "id": "saffire-11",
      "study": "saffire",
      "type": "objective",
      "text": "The flame heat release is determined and is compared to the overall temperature rise in the spacecraft and the change in the concentration of carbon dioxide and carbon monoxide in the spacecraft.",
      "slide": null,
      "url": "https://ntrs.nasa.gov/citations/20240007488",
      "scope": "NTRS record abstract",
      "meta": {
        "platform": null,
        "vehicle": null,
        "materials": [],
        "variables": [
          "heat release",
          "temperature rise",
          "carbon dioxide concentration",
          "carbon monoxide concentration"
        ]
      }
    },
    {
      "id": "saffire-12",
      "study": "saffire",
      "type": "condition",
      "text": "The final flight examined concurrent spread over large samples (all 41 cm wide) including a thin sheet of flammable fuel (cotton/fiberglass 50 cm long); 2-sided spread over 1 cm thick polymethyl methacrylate (PMMA) (18 cm long); 1-sided spread over 0.5 cm thick (18 cm long); and Nomex fabric (7 cm long).",
      "slide": null,
      "url": "https://ntrs.nasa.gov/citations/20240007488",
      "scope": "NTRS record abstract (quoted with spacing normalized)",
      "meta": {
        "platform": null,
        "vehicle": "Cygnus",
        "materials": [
          "cotton/fiberglass",
          "PMMA",
          "Nomex fabric"
        ],
        "variables": [
          "flame spread",
          "sample width",
          "sample length",
          "sample thickness"
        ]
      }
    },
    {
      "id": "saffire-13",
      "study": "saffire",
      "type": "condition",
      "text": "The preliminary results are presented for one test of the last flight of the Spacecraft Fire Experiment (Saffire VI) which was conducted on an orbiting Cygnus spacecraft.",
      "slide": null,
      "url": "https://ntrs.nasa.gov/citations/20240007488",
      "scope": "NTRS record abstract",
      "meta": {
        "platform": null,
        "vehicle": "Cygnus",
        "materials": [],
        "variables": [
          "test scope"
        ]
      }
    },
    {
      "id": "flex-01",
      "study": "flex",
      "type": "finding",
      "text": "Non-premixed cool flames, created when fuel and oxidizer are not mixed before reacting, were discovered in 2012 aboard the space station during the Flame Extinguishment (FLEX) studies.",
      "slide": null,
      "url": "https://www.nasa.gov/missions/station/cool-flames-created-during-a-first-for-international-space-station-research/",
      "scope": "NASA article, July 16, 2021 (2012 discovery)",
      "meta": {
        "platform": "International Space Station",
        "vehicle": null,
        "materials": [],
        "variables": [
          "cool flames",
          "non-premixed",
          "discovery"
        ]
      }
    },
    {
      "id": "flex-02",
      "study": "flex",
      "type": "finding",
      "text": "Cool flames, flames that burn at extremely low temperatures, are nearly impossible to create in Earth's gravity. However, they are easily produced in the microgravity environment of the International Space Station.",
      "slide": null,
      "url": "https://www.nasa.gov/missions/station/cool-flames-created-during-a-first-for-international-space-station-research/",
      "scope": "NASA article, July 16, 2021",
      "meta": {
        "platform": "International Space Station",
        "vehicle": null,
        "materials": [],
        "variables": [
          "cool flames",
          "low temperature",
          "microgravity"
        ]
      }
    },
    {
      "id": "flex-03",
      "study": "flex",
      "type": "condition",
      "text": "While the flames created aboard station in 2012 burned liquid fuel, these new cool flames burned gaseous fuels.",
      "slide": null,
      "url": "https://www.nasa.gov/missions/station/cool-flames-created-during-a-first-for-international-space-station-research/",
      "scope": "NASA article. “New” flames = the June 2021 CFI-G tests, a later study than FLEX.",
      "meta": {
        "platform": "International Space Station",
        "vehicle": null,
        "materials": [
          "liquid fuel",
          "gaseous fuel"
        ],
        "variables": [
          "fuel phase"
        ]
      }
    },
    {
      "id": "flex-04",
      "study": "flex",
      "type": "finding",
      "text": "This was the first time spherical non-premixed cool flames have been observed burning gaseous fuels.",
      "slide": null,
      "url": "https://www.nasa.gov/missions/station/cool-flames-created-during-a-first-for-international-space-station-research/",
      "scope": "About the later June 2021 CFI-G tests, not FLEX itself",
      "meta": {
        "platform": "International Space Station",
        "vehicle": null,
        "materials": [
          "gaseous fuel"
        ],
        "variables": [
          "cool flames"
        ]
      }
    },
    {
      "id": "flex-05",
      "study": "flex",
      "type": "finding",
      "text": "Since cool flames give off little heat or light, they were too faint to be visible in real time during space station testing. The research team uncovered the presence of three cool flames in the data on thermal radiation and burner temperature measurements after the hot flames were quenched.",
      "slide": null,
      "url": "https://www.nasa.gov/missions/station/cool-flames-created-during-a-first-for-international-space-station-research/",
      "scope": "About the later June 2021 CFI-G tests, not FLEX itself",
      "meta": {
        "platform": "International Space Station",
        "vehicle": null,
        "materials": [],
        "variables": [
          "thermal radiation",
          "burner temperature"
        ]
      }
    },
    {
      "id": "flex-06",
      "study": "flex",
      "type": "objective",
      "text": "The results of this investigation could lead to cleaner, more efficient internal combustion engines.",
      "slide": null,
      "url": "https://www.nasa.gov/missions/station/cool-flames-created-during-a-first-for-international-space-station-research/",
      "scope": "Stated possible application (CFI-G investigation)",
      "meta": {
        "platform": null,
        "vehicle": null,
        "materials": [],
        "variables": [
          "internal combustion engines"
        ]
      }
    },
    {
      "id": "sofie-01",
      "study": "sofie",
      "type": "objective",
      "text": "The SoFIE-MIST investigation examines thermally-assisted burning in microgravity, by varying parameters including air flow speed, oxygen concentration, pressure, and level of external radiation.",
      "slide": null,
      "url": "https://science.nasa.gov/biological-physical/investigations/sofie-mist/",
      "scope": "NASA investigation page, Science Objectives (quoted, with the full project title shortened to SoFIE-MIST)",
      "meta": {
        "platform": "International Space Station",
        "vehicle": null,
        "materials": [],
        "variables": [
          "air flow speed",
          "oxygen concentration",
          "pressure",
          "external radiation"
        ]
      }
    },
    {
      "id": "sofie-02",
      "study": "sofie",
      "type": "objective",
      "text": "Results could improve understanding of early fire growth behavior and validate models for material flammability, helping to inform selection of safer materials for future space facilities and determine the best methods for extinguishing fires in space.",
      "slide": null,
      "url": "https://science.nasa.gov/biological-physical/investigations/sofie-mist/",
      "scope": "NASA investigation page, Science Objectives (expected benefits, not results)",
      "meta": {
        "platform": "International Space Station",
        "vehicle": null,
        "materials": [],
        "variables": [
          "early fire growth",
          "material flammability"
        ]
      }
    },
    {
      "id": "sofie-03",
      "study": "sofie",
      "type": "objective",
      "text": "The boundaries for ignition and extinction of a solid fuel (PMMA cylinder) as a function of flow speed, oxygen concentration, and external radiant flux are to be determined.",
      "slide": null,
      "url": "https://science.nasa.gov/biological-physical/investigations/sofie-mist/",
      "scope": "NASA investigation page, Experiment Description",
      "meta": {
        "platform": "International Space Station",
        "vehicle": null,
        "materials": [
          "PMMA cylinder"
        ],
        "variables": [
          "ignition boundary",
          "extinction boundary",
          "flow speed",
          "oxygen concentration",
          "external radiant flux"
        ]
      }
    },
    {
      "id": "sofie-04",
      "study": "sofie",
      "type": "objective",
      "text": "The effects of the space exploration atmospheres (SEA) under consideration by NASA (lower pressure and increased oxygen concentrations compared to air) on the flammability and suppression of materials are of particular interest.",
      "slide": null,
      "url": "https://science.nasa.gov/biological-physical/investigations/sofie-mist/",
      "scope": "NASA investigation page, Experiment Description",
      "meta": {
        "platform": "International Space Station",
        "vehicle": null,
        "materials": [],
        "variables": [
          "pressure",
          "oxygen concentration",
          "flammability",
          "suppression"
        ]
      }
    },
    {
      "id": "sofie-05",
      "study": "sofie",
      "type": "condition",
      "text": "Delivery to the International Space Station via SpaceX-27.",
      "slide": null,
      "url": "https://science.nasa.gov/biological-physical/investigations/sofie-mist/",
      "scope": "NASA investigation page, Status line",
      "meta": {
        "platform": "International Space Station",
        "vehicle": "SpaceX-27",
        "materials": [],
        "variables": [
          "delivery"
        ]
      }
    },
    {
      "id": "sofie-06",
      "study": "sofie",
      "type": "condition",
      "text": "Solid fuel (PMMA cylinder).",
      "slide": null,
      "url": "https://science.nasa.gov/biological-physical/investigations/sofie-mist/",
      "scope": "NASA investigation page, Experiment Description (quoted fragment)",
      "meta": {
        "platform": "International Space Station",
        "vehicle": null,
        "materials": [
          "PMMA cylinder"
        ],
        "variables": [
          "solid fuel"
        ]
      }
    }
  ]
};
  corpus.slideUrl = function (n) { return corpus.pdfBase + '#page=' + n; };
  return corpus;
});
