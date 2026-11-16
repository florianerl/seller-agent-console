/**
 * Example payloads for the OpenProposal mapping inputs, so an operator can see
 * what each route expects before pasting their own export.
 *
 * Copied verbatim from the request examples the seller agent publishes on its
 * `feat/openproposal-mapping` branch (routers/openproposal.py at e77022e):
 * `standard_pg_line`, a batch of that line plus `house_line` (which the agent
 * rejects as not a sale, so the batch shows an unmappable entry), the
 * `display_run_of_site` ad unit, and the `three_ad_servers` many-to-one
 * proposal. Not the console's invention, and replaced from the same place
 * when upstream changes them.
 */

export const GAM_LINE_ITEM_EXAMPLE = {
  "network_code": "12345678",
  "order": {
    "id": 3961795097,
    "name": "Launch Campaign - OpenDirect PG",
    "currencyCode": "USD",
    "isProgrammatic": false
  },
  "line_item": {
    "id": 7202154879,
    "orderId": 3961795097,
    "name": "Streaming brand - PG Line - 2,250,000 imps",
    "externalId": "OD-BC9DAEFA",
    "lineItemType": "STANDARD",
    "status": "DRAFT",
    "reservationStatus": "UNRESERVED",
    "priority": 8,
    "costType": "CPM",
    "costPerUnit": {
      "currencyCode": "USD",
      "microAmount": 27840000
    },
    "primaryGoal": {
      "goalType": "LIFETIME",
      "unitType": "IMPRESSIONS",
      "units": 2250000
    },
    "startDateTime": {
      "date": {
        "year": 2026,
        "month": 3,
        "day": 1
      },
      "hour": 0,
      "minute": 0,
      "second": 0,
      "timeZoneId": "America/New_York"
    },
    "endDateTime": {
      "date": {
        "year": 2026,
        "month": 6,
        "day": 30
      },
      "hour": 23,
      "minute": 59,
      "second": 0,
      "timeZoneId": "America/New_York"
    },
    "deliveryRateType": "EVENLY",
    "creativeRotationType": "EVEN",
    "roadblockingType": "ONE_OR_MORE",
    "environmentType": "BROWSER",
    "creativePlaceholders": [
      {
        "size": {
          "width": 300,
          "height": 250
        },
        "creativeSizeType": "PIXEL"
      },
      {
        "size": {
          "width": 728,
          "height": 90
        },
        "creativeSizeType": "PIXEL"
      }
    ],
    "targeting": {
      "inventoryTargeting": {
        "targetedAdUnits": [
          {
            "adUnitId": "54545842",
            "includeDescendants": true
          }
        ]
      }
    }
  }
};

export const GAM_BATCH_EXAMPLE = {
  "network_code": "12345678",
  "orders": [
    {
      "id": 3961795097,
      "name": "Launch Campaign - OpenDirect PG",
      "currencyCode": "USD",
      "isProgrammatic": false
    }
  ],
  "line_items": [
    {
      "id": 7202154879,
      "orderId": 3961795097,
      "name": "Streaming brand - PG Line - 2,250,000 imps",
      "externalId": "OD-BC9DAEFA",
      "lineItemType": "STANDARD",
      "status": "DRAFT",
      "reservationStatus": "UNRESERVED",
      "priority": 8,
      "costType": "CPM",
      "costPerUnit": {
        "currencyCode": "USD",
        "microAmount": 27840000
      },
      "primaryGoal": {
        "goalType": "LIFETIME",
        "unitType": "IMPRESSIONS",
        "units": 2250000
      },
      "startDateTime": {
        "date": {
          "year": 2026,
          "month": 3,
          "day": 1
        },
        "hour": 0,
        "minute": 0,
        "second": 0,
        "timeZoneId": "America/New_York"
      },
      "endDateTime": {
        "date": {
          "year": 2026,
          "month": 6,
          "day": 30
        },
        "hour": 23,
        "minute": 59,
        "second": 0,
        "timeZoneId": "America/New_York"
      },
      "deliveryRateType": "EVENLY",
      "creativeRotationType": "EVEN",
      "roadblockingType": "ONE_OR_MORE",
      "environmentType": "BROWSER",
      "creativePlaceholders": [
        {
          "size": {
            "width": 300,
            "height": 250
          },
          "creativeSizeType": "PIXEL"
        },
        {
          "size": {
            "width": 728,
            "height": 90
          },
          "creativeSizeType": "PIXEL"
        }
      ],
      "targeting": {
        "inventoryTargeting": {
          "targetedAdUnits": [
            {
              "adUnitId": "54545842",
              "includeDescendants": true
            }
          ]
        }
      }
    },
    {
      "id": 1001,
      "orderId": 2001,
      "name": "House banner",
      "lineItemType": "HOUSE",
      "status": "DELIVERING"
    }
  ]
};

export const GAM_AD_UNIT_EXAMPLE = {
  "network_code": "12345678",
  "ad_unit": {
    "id": "54545842",
    "name": "Run-of-Site",
    "parentId": "17980522",
    "parentPath": [
      {
        "id": "17980402",
        "name": "12345678"
      },
      {
        "id": "17980522",
        "name": "publisher.example"
      }
    ],
    "adUnitCode": "pubROS",
    "status": "ACTIVE",
    "adUnitSizes": [
      {
        "size": {
          "width": 320,
          "height": 50
        },
        "environmentType": "BROWSER"
      },
      {
        "size": {
          "width": 728,
          "height": 90
        },
        "environmentType": "BROWSER"
      },
      {
        "size": {
          "width": 970,
          "height": 250
        },
        "environmentType": "BROWSER"
      }
    ],
    "isNative": false,
    "isFluid": false,
    "isInterstitial": false,
    "targetWindow": "BLANK",
    "smartSizeMode": "NONE"
  }
};

export const MANY_TO_ONE_EXAMPLE = {
  "proposal_id": "examplepub-cross-channel-open",
  "seller_id": "examplepub",
  "seller_name": "Example Publisher US",
  "type": "standard",
  "description": "Business audiences across web, newsletter and CTV.",
  "valid_from": "2026-10-20T00:00:00Z",
  "valid_until": "2026-12-31T23:59:59Z",
  "line_items": [
    {
      "line_item_id": "business-web-display",
      "serving_platform": "gam",
      "namespace": "network:21700000",
      "objects": [
        {
          "domains": [
            "business-daily.example"
          ],
          "gam_ad_unit": {
            "id": "21780011",
            "name": "Business Daily",
            "adUnitSizes": [
              {
                "size": {
                  "width": 300,
                  "height": 250
                }
              },
              {
                "size": {
                  "width": 728,
                  "height": 90
                }
              }
            ]
          }
        },
        {
          "domains": [
            "markets-weekly.example"
          ],
          "gam_ad_unit": {
            "id": "21780019",
            "name": "Markets Weekly",
            "adUnitSizes": [
              {
                "size": {
                  "width": 300,
                  "height": 250
                }
              }
            ]
          }
        }
      ],
      "included": [
        "21780011"
      ],
      "option_pricing": {
        "21780019": {
          "delta_cpm": 2.0
        }
      },
      "pricing": {
        "cost_method": "CPM",
        "gross_rate": 18.0,
        "currency": "USD"
      },
      "availability": {
        "unit": "impressions",
        "basis": "flight",
        "as_of": "2026-10-19",
        "granularity": "line_item",
        "type": "forecast",
        "quantity": 6200000
      }
    },
    {
      "line_item_id": "business-newsletter-display",
      "serving_platform": "kevel",
      "namespace": "network:9120",
      "objects": [
        {
          "id": "4401",
          "role": "zone",
          "name": "Daily newsletter",
          "domains": [
            "newsletter.example"
          ],
          "formats": [
            "display/600x200"
          ],
          "channel": "display"
        }
      ],
      "pricing": {
        "cost_method": "CPM",
        "gross_rate": 21.0,
        "currency": "USD"
      },
      "availability": {
        "type": "forecast",
        "quantity": 300000,
        "as_of": "2026-10-19"
      }
    },
    {
      "line_item_id": "weather-ctv",
      "serving_platform": "freewheel",
      "namespace": "network:169843",
      "serving_mode": "ssai",
      "objects": [
        {
          "id": "88120",
          "role": "site_section",
          "name": "Weather app",
          "apps": [
            {
              "platform": "roku",
              "bundle": "weatherapp.roku"
            }
          ],
          "formats": [
            "ctv/instream-15s",
            "ctv/instream-30s"
          ],
          "channel": "ctv"
        }
      ]
    }
  ]
};
