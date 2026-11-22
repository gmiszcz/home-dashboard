# Bar chart point groups (expenses tile)

A `bars` block can tag each point with a group, for example morning and evening readings.
When the visible bar charts of a tile carry 2 or more distinct groups, the first grouped chart
shows one icon button per group. The selection filters every `bars` block in the tile.
Without groups there is no toggle.

## Payload

`groups` is an optional array of the same length as `labels`. Each entry is an object or `null`
(the point belongs to no group and is always shown).

```json
{
  "type": "bars",
  "labels": ["20.11", "20.11", "21.11", "21.11"],
  "groups": [
    { "id": "sun", "icon": "sun", "label": "Rano" },
    { "id": "moon", "icon": "moon", "label": "Wieczór" },
    { "id": "sun", "icon": "sun", "label": "Rano" },
    { "id": "moon", "icon": "moon", "label": "Wieczór" }
  ],
  "series": [{ "name": "Skurczowe", "values": [128, 134, 125, 131] }]
}
```

| Field | Meaning |
| --- | --- |
| `id` | Group key. Points with the same `id` form one group. Required. |
| `icon` | [PrimeIcons](https://primereact.org/icons/) name, with or without `pi-` (`sun`, `moon`). Letters, digits and `-` only. Required. |
| `label` | Tooltip and accessible name. Defaults to `id`. |

An entry that is not valid, or a `groups` array with the wrong length, is ignored.

## Selection

- All groups start selected. The last selected group cannot be turned off.
- The selection is stored per section in `localStorage` (`dashboard_groups_<section>`).

## Fallback

Without `groups`, a label ending in ` r` (morning, sun) or ` w` (evening, moon), for example
`"16.11 r"`, is read as a group. Prefer `groups` for new payloads.

Sample payload for Ryuk: `samples/cisnienie.json` (sun = rano, moon = wieczór).
