'use strict';
// ---------------------------------------------------------------------------
// Explanations shown when the player breaks a rule (based on Lithuanian KET).
// ---------------------------------------------------------------------------
const RULES = {
  crash: {
    title: 'Collision!',
    text: 'You hit another road user. Watch the traffic around you, keep a safe distance and give way whenever the rules require it.',
    ket: 'KET: drivers must not endanger other road users and must keep a safe distance and speed.',
  },
  trainCrash: {
    title: 'Hit by a train!',
    text: 'Trains cannot stop quickly and ALWAYS have priority at a level crossing. Never enter the crossing while a train is approaching.',
    ket: 'KET: crossing the railway is prohibited when a train is approaching, the barrier is lowered or the red lights are flashing.',
  },
  offroad: {
    title: 'You left the carriageway',
    text: 'Vehicles must drive on the carriageway (važiuojamoji dalis). Driving onto the kerb, sidewalk or verge is prohibited. Take turns at a lower speed.',
    ket: 'KET: driving on sidewalks and footpaths is prohibited.',
  },
  wrongLane: {
    title: 'Driving on the wrong side',
    text: 'In Lithuania traffic keeps to the RIGHT. The left half of a two-way road belongs to oncoming traffic.',
    ket: 'KET: right-hand traffic – drive as close as practical to the right edge of the carriageway.',
  },
  solidLine: {
    title: 'Crossed a solid line',
    text: 'A continuous centre line must never be crossed. Stay in your lane on the right.',
    ket: 'KET: road marking 1.1 (ištisinė linija) must not be crossed.',
  },
  speeding: {
    title: 'Speeding',
    text: 'You exceeded the speed limit.',
    ket: 'KET: in built-up areas the limit is 50 km/h, outside built-up areas 90 km/h for cars on paved roads (unless signs say otherwise). Sign "Didžiausias leistinas greitis" sets a limit until the end-of-limit sign or the next junction / built-up area boundary.',
  },
  noSignal: {
    title: 'No turn signal',
    text: 'Before turning you must switch on the turn indicator in good time, so other road users know what you intend to do. Press Q (left) or E (right) BEFORE the junction.',
    ket: 'KET: before starting to move, changing lanes, turning or stopping the driver must give a signal with the direction indicators in advance.',
  },
  lateSignal: {
    title: 'Signal too late',
    text: 'You switched the indicator on at the very last moment. Signal well before you reach the junction.',
    ket: 'KET: the signal must be given in advance (iš anksto) and must be kept on until the manoeuvre is completed.',
  },
  wrongSignal: {
    title: 'Misleading signal',
    text: 'Your indicator was on although you went straight. A wrong signal misleads other road users.',
    ket: 'KET: a signal must not mislead other road users. Switch it off when the manoeuvre is finished.',
  },
  rbSignal: {
    title: 'No signal when leaving the roundabout',
    text: 'Switch on the RIGHT indicator (E) before you leave the roundabout at your exit.',
    ket: 'KET: when leaving a roundabout the driver must signal with the right direction indicator.',
  },
  rbDirection: {
    title: 'Wrong direction in the roundabout',
    text: 'In right-hand traffic you drive around the roundabout anti-clockwise – keep the central island on your LEFT.',
    ket: 'KET: sign "Žiedinė sankryža" – traffic moves around the island in the direction of the arrows.',
  },
  stopSign: {
    title: 'You did not stop at the STOP sign',
    text: 'At a STOP sign you must come to a COMPLETE stop (0 km/h) at the stop line – even if the road looks empty – and then give way to all traffic on the road you are entering.',
    ket: 'KET: sign "STOP – Sustoti ir duoti kelią": driving on without stopping is prohibited; stop before the stop line (or the edge of the crossed carriageway) and give way.',
  },
  redLight: {
    title: 'You drove through a red light',
    text: 'A red signal (and red + yellow together) prohibits passing the stop line. Wait for the green light.',
    ket: 'KET: red signal – movement prohibited; red with yellow – movement still prohibited, green is coming.',
  },
  yellowLight: {
    title: 'Entered on yellow',
    text: 'A yellow signal means STOP if you can do so safely. You had enough distance to stop but went through.',
    ket: 'KET: a yellow signal prohibits movement except for drivers who cannot stop without emergency braking.',
  },
  yieldMain: {
    title: 'You failed to give way',
    text: 'You are on a minor road. Traffic on the main road has priority – wait for a safe gap before entering.',
    ket: 'KET: signs "Duoti kelią" / "STOP" – give way to vehicles on the road you are entering or crossing.',
  },
  yieldRight: {
    title: 'You failed to give way to the right',
    text: 'At a junction of equal roads without signs or lights you must give way to vehicles approaching from your RIGHT ("dešinės rankos taisyklė").',
    ket: 'KET: at an unregulated junction of equal roads, the driver must give way to vehicles approaching from the right.',
  },
  yieldOncoming: {
    title: 'You failed to give way to oncoming traffic',
    text: 'When turning LEFT you must let oncoming vehicles that go straight or turn right pass first – even on a green light.',
    ket: 'KET: when turning left or making a U-turn, the driver must give way to oncoming vehicles going straight ahead or turning right.',
  },
  yieldRb: {
    title: 'You failed to give way in the roundabout',
    text: 'Vehicles already driving in the roundabout have priority. Wait at the give-way line until there is a gap on your LEFT.',
    ket: 'KET: signs "Žiedinė sankryža" + "Duoti kelią" – entering vehicles give way to those already circulating.',
  },
  yieldPed: {
    title: 'You did not give way to a pedestrian',
    text: 'At an unregulated pedestrian crossing you must stop and let pedestrians who are crossing or stepping onto the crossing go first. You may drive on once they have passed your lane and are walking away from it – never while they are in front of you or heading towards your lane.',
    ket: 'KET: at a pedestrian crossing (pėsčiųjų perėja) the driver must give way to pedestrians crossing the carriageway or stepping onto the crossing.',
  },
  yieldBus: {
    title: 'You did not let the bus leave the stop',
    text: 'In built-up areas you must give way to a route vehicle (bus or trolleybus) leaving a marked stop when it signals.',
    ket: 'KET: in built-up areas drivers must give way to route vehicles departing from a stop.',
  },
  rail: {
    title: 'Entered the level crossing while signals flashed',
    text: 'When the red lights flash or the barrier is going down you must stop at the stop line (or at least 10 m before the nearest rail) and wait until the train has passed and the lights have stopped.',
    ket: 'KET: it is prohibited to enter a level crossing when the barrier is closed or closing, or the red signal / sound signal is on.',
  },
  stopRail: {
    title: 'You did not stop before the level crossing',
    text: 'At an unguarded level crossing marked with a STOP sign you must stop completely at the stop line (at least 10 m before the nearest rail), look both ways and only then cross.',
    ket: 'KET: sign "STOP" before a level crossing – stop before the stop line or the sign; cross only when no train is approaching.',
  },
  route: {
    title: 'You left the planned route',
    text: 'Follow the blue route line to your destination.',
    ket: '',
  },
  laneTurn: {
    title: 'Wrong lane for the turn',
    text: 'Turn right from the rightmost lane and left from the leftmost lane of your direction.',
    ket: 'KET: before turning right or left the driver must take the appropriate extreme lane in advance.',
  },
};
