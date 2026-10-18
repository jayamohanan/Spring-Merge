# Mars Colony Roster (65 levels)

Each RELEASE launches **3 of the same item**, one from each spring. They land on Mars and a banner pops up.
There are **13 sections of 5 levels**. Each section is a small story with its own "complete" celebration, so the player finishes a story every few minutes.

Rules: a human theme, kid-friendly and recognisable at a glance. No science or tech items, no cargo or materials.

## 1. Base Camp: "Base Camp ready!"

| Lvl | Launch (×3) | Banner |
|---|---|---|
| 1 | Astronauts | First humans on Mars! |
| 2 | Flags | We made it! |
| 3 | Dome Tents | Camp is up! |
| 4 | Solar Panels | Lights on! |
| 5 | Water Towers | Splash! Fresh water! |

## 2. Food: "Nobody's hungry!"

| Lvl | Launch (×3) | Banner |
|---|---|---|
| 6 | Veggie Gardens | Something's growing! |
| 7 | Fruit Trees | Fresh apples! |
| 8 | Chicken Coops | Eggs for breakfast! |
| 9 | Cows | Moo on Mars! |
| 10 | Picnic Tables | Dinner time! |

## 3. Neighbourhood: "Welcome home!"

| Lvl | Launch (×3) | Banner |
|---|---|---|
| 11 | Little Houses | Moving in! |
| 12 | Families | Families arrive! |
| 13 | Pet Dogs | Woof on Mars! |
| 14 | Street Lamps | Lights on! |
| 15 | Mars Rovers | Let's go for a ride! |

## 4. School: "School's open!"

| Lvl | Launch (×3) | Banner |
|---|---|---|
| 16 | Kids | Kids on Mars! |
| 17 | Schools | First day of school! |
| 18 | Playgrounds | Recess! |
| 19 | Libraries | Story time! |
| 20 | Ice Cream Stands | Treat time! |

## 5. Safety: "Safe and sound!"

| Lvl | Launch (×3) | Banner |
|---|---|---|
| 21 | Doctors | The doctor is in! |
| 22 | Hospitals | Get well soon! |
| 23 | Ambulances | Nee-naw! |
| 24 | Fire Trucks | Fire safety! |
| 25 | Police Cars | Keeping us safe! |

## 6. Main Street: "Shops are open!"

| Lvl | Launch (×3) | Banner |
|---|---|---|
| 26 | Bakeries | Fresh bread! |
| 27 | Shops | Open for business! |
| 28 | Cafés | Hot cocoa! |
| 29 | Pizza Places | Pizza party! |
| 30 | Fountains | Town square! |

## 7. Sports: "Game on!"

| Lvl | Launch (×3) | Banner |
|---|---|---|
| 31 | Bicycles | Ride on! |
| 32 | Football Pitches | Goal! |
| 33 | Swimming Pools | Splash! |
| 34 | Basketball Courts | Slam dunk! |
| 35 | Stadiums | The crowd goes wild! |

## 8. Getting Around: "All connected!"

| Lvl | Launch (×3) | Banner |
|---|---|---|
| 36 | Buses | All aboard! |
| 37 | Bridges | Across the canyon! |
| 38 | Trains | Choo choo! |
| 39 | Train Stations | Next stop: Mars! |
| 40 | Helicopters | Up, up and away! |

## 9. Fun Park: "Fun Park opens!"

| Lvl | Launch (×3) | Banner |
|---|---|---|
| 41 | Carousels | Round and round! |
| 42 | Bumper Cars | Bump! |
| 43 | Ferris Wheels | What a view! |
| 44 | Roller Coasters | Wheee! |
| 45 | Hot Air Balloons | Float away! |

## 10. Nature: "Mars is alive!"

| Lvl | Launch (×3) | Banner |
|---|---|---|
| 46 | Trees | First forest! |
| 47 | Flower Gardens | So colourful! |
| 48 | Aquariums | Fishy friends! |
| 49 | Petting Zoos | Baby animals! |
| 50 | Space Zoos | Wild Mars! |

## 11. Party Time: "Party on Mars!"

| Lvl | Launch (×3) | Banner |
|---|---|---|
| 51 | Cinemas | Movie night! |
| 52 | Circus Tents | Roll up, roll up! |
| 53 | Museums | Look at that! |
| 54 | Concert Stages | Rock on Mars! |
| 55 | Fireworks | Boom! |

## 12. Big City: "A real city!"

| Lvl | Launch (×3) | Banner |
|---|---|---|
| 56 | Apartment Blocks | Room for everyone! |
| 57 | Hotels | Holiday on Mars! |
| 58 | Town Halls | Our own city! |
| 59 | Shopping Malls | Shop till you drop! |
| 60 | Skyscrapers | Sky high! |

## 13. Mars is Home: "Mars is home!"

| Lvl | Launch (×3) | Banner |
|---|---|---|
| 61 | Lakes | Water everywhere! |
| 62 | Castles | Fit for a king! |
| 63 | Astronaut Statues | Our heroes! |
| 64 | Big Glass Domes | Blue skies! |
| 65 | Rockets to Earth | Hello, Earth! |

## Notes

- **Every level launches 3 of one item.** That's still only 65 unique images (each drawn once, shown 3 times), about 1 MB in total.
- **Section complete:** play a celebration with the section banner, plus a possible rewarded-ad bonus.
- **Mars goes green:** the ground tint shifts from red to green as sections are completed.
- **Colonists** (astronauts, kids, families) walk around once there are houses.
- **Showing it:** sections share one screen, and each section is a small cluster on the Mars map. Only the current section is live sprites (at most 15). When a section completes, its sprites are drawn into one baked colony texture (RenderTexture) and destroyed, so the object count stays low.
- **Assets:** one atlas per few sections. Load the current one at boot and the next one in the background.
