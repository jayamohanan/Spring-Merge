# Mars Colony Roster (65 levels)

Each RELEASE launches one finished building in a pod. It lands on Mars and the colony grows.
There are 5 districts of 13 buildings. Each district is one screen. Finishing a district plays a celebration and moves on to the next plot.

Size: S ≈ 0.7×, M ≈ 1×, L ≈ 1.3× (put L buildings at the edges and the back of the district).

Rules: kid-friendly and recognisable at a glance. No science or tech items (oxygen, reactors, labs), no cargo or materials.

## District 1: Home Base (levels 1–13)

| Lvl | Building | Size | On landing |
|---|---|---|---|
| 1 | Flag | S | Flag waves |
| 2 | Tent | S | Door flap opens |
| 3 | Little House | S | Lights turn on |
| 4 | Water Tank | S | Water sloshes |
| 5 | Veggie Garden | S | Sprouts pop up |
| 6 | Windmill | M | Blades spin |
| 7 | Solar Panels | S | Panels tilt and sparkle |
| 8 | Robot Doghouse | S | Robot dog wags its tail |
| 9 | Big House | M | Chimney smoke |
| 10 | Chicken Coop | S | Chicken hops out |
| 11 | Picnic Area | S | Umbrella pops open |
| 12 | Lemonade Stand | S | Sign flips "OPEN" |
| 13 | Welcome to Mars Arch | M | Balloons float up |

## District 2: Village (levels 14–26)

| Lvl | Building | Size | On landing |
|---|---|---|---|
| 14 | Bakery | M | Chimney smoke, bread smell puffs |
| 15 | Market / Shop | M | Awning unrolls |
| 16 | School | L | Bell rings, kids run in |
| 17 | Playground | M | Swing swings |
| 18 | Hospital | L | Ambulance light flashes |
| 19 | Fire Station | M | Door rolls up, truck peeks out |
| 20 | Police Station | M | Siren light spins |
| 21 | Post Office | M | Letters fly out |
| 22 | Library | M | Book pages flutter |
| 23 | Ice Cream Stand | S | Giant cone bounces |
| 24 | Fountain Park | M | Water sprays |
| 25 | Farm with Barn | L | Cow moos, barn doors open |
| 26 | Clock Tower | L | Clock chimes |

## District 3: Town (levels 27–39)

| Lvl | Building | Size | On landing |
|---|---|---|---|
| 27 | Apartment Block | L | Windows light up one by one |
| 28 | Restaurant | M | Steam from the kitchen |
| 29 | Swimming Pool | M | Splash |
| 30 | Football Stadium | L | Crowd cheers, ball bounces |
| 31 | Cinema | M | Marquee lights chase |
| 32 | Train Station | L | Train pulls in |
| 33 | Rover Garage | M | Rover drives out |
| 34 | Bank | M | Coins sparkle |
| 35 | Town Hall | L | Flag rises |
| 36 | Bus Stop | S | Bus stops by |
| 37 | Lighthouse | M | Light beam sweeps |
| 38 | Museum | L | Dinosaur skeleton peeks out |
| 39 | Hotel | L | Revolving door spins |

## District 4: Fun Zone (levels 40–52)

| Lvl | Building | Size | On landing |
|---|---|---|---|
| 40 | Zoo | L | Space animals wave |
| 41 | Ferris Wheel | L | Wheel turns |
| 42 | Carousel | M | Horses go round |
| 43 | Water Park | L | Slide splash |
| 44 | Roller Coaster | L | Cart zooms round |
| 45 | Bumper Cars | M | Cars bump |
| 46 | Bowling Alley | M | Pins fall |
| 47 | Circus Tent | L | Flags flutter, confetti |
| 48 | Arcade | M | Neon blinks |
| 49 | Mini Golf | M | Ball rolls into hole |
| 50 | Aquarium | L | Fish swim past glass |
| 51 | Skate Park | M | Skater jumps |
| 52 | Hot Air Balloon Ride | M | Balloon lifts and bobs |

## District 5: Big City (levels 53–65)

| Lvl | Building | Size | On landing |
|---|---|---|---|
| 53 | Skyscraper | L | Windows light up floor by floor |
| 54 | Giant Pizza Restaurant | M | Pizza sign spins |
| 55 | Shopping Mall | L | Doors slide open |
| 56 | TV Tower | L | Signal rings pulse |
| 57 | Airport | L | Plane takes off |
| 58 | Castle | L | Drawbridge lowers |
| 59 | Monorail | L | Train glides across |
| 60 | Concert Stage | L | Spotlights and music notes |
| 61 | Piggy Statue | M | Statue shines |
| 62 | Rainbow Bridge | L | Rainbow fades in |
| 63 | Tallest Tower | L | Fireworks from the top |
| 64 | Big Glass Dome | L | Dome covers the city, sky turns blue |
| 65 | Rocket Back to Earth | L | Countdown and lift-off (finale) |

## Notes

- **Mars goes green:** the ground tint shifts from red to green as levels go up, and trees appear between the buildings.
- **Piggy colonists** walk around once there are houses.
- **Assets:** about 15 KB per building, about 1 MB in total. One atlas per district (~200 KB). Load the current district at boot and the next one in the background a few levels before it's needed.
- **Layout:** each district has a preset list of spots `{x, y, scale}`, with one list for landscape and one for portrait. The camera starts zoomed in and zooms out as the district fills.
- **District complete:** celebration, plus a possible rewarded-ad bonus.
