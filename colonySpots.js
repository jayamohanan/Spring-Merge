// Colony spots: where each payload item's three copies land on the Mars map.
// Keyed by CONFIG.PAYLOAD.FILES name. Each spot is [x, y, size] in map px on a
// 2048×2048 map, centre (1024, 1024); size is the sprite's longest side.
// Written by tools/colony-editor.html.
const COLONY_SPOTS = {
    'spacecraft':   [[700, 1010, 200], [1090, 1000, 200], [1180, 1300, 200]],
    'astronaut':    [[943, 943, 91], [1218, 1067, 91], [976, 1186, 91]],
    'flag':         [[880, 941, 90], [1289, 1069, 90], [1047, 1164, 90]],
    'dome':         [[884, 807, 247], [1397, 1162, 247], [793, 1216, 247]],
    'solar-panels': [[1063, 787, 156], [1598, 1181, 156], [595, 1200, 156]],
    'water-tower':  [[666, 819, 216], [1542, 988, 216], [513, 1222, 216]],
    'antenna':      [[1300, 760, 220], [1420, 1440, 220], [700, 1450, 220]],
};
