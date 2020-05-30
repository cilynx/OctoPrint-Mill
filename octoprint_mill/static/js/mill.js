$(function() {
	function MillViewModel(parameters) {
		var self = this;
		self.settings = parameters[0];

		// When checking M119 response
		self.probeTriggered = /Probe: 1/;
		self.probeOpen = /Probe: 0/;

		// When checking G38.3 respones
		// Miss: [PRB:0.723,20.000,-2.000:0]
		// Hit: [PRB:3.941,33.000,-2.000:1]
		self.probeHit = /\[PRB:(.*?),(.*?),(.*?):1\]/;
		self.probeMiss = /\[PRB:(.*?),(.*?),(.*?):0\]/;

		// Movement direction: "X+", "X-", "Y+", "Y-", "Z+", "Z-"
		self.dir= "";
		self.travelDir = null;
		self.probeDir = null;

		// Probe mode: "backlash", "backtrace", "trace"
		self.mode = "";

		// Travel distance (mm) between probes
		self.travelDist = 10;

		self.g0feed = ko.observable(400);
		self.g1feed = ko.observable(200);
		self.offset = ko.observable(false);
		self.cutLR = ko.observable(false);
		self.cutRL = ko.observable(true);
		self.xMax = ko.observable(null);
		self.xMin = ko.observable(null);
		self.xMid = ko.computed(function() { return (self.xMax() + self.xMin()) / 2; }, self);
		self.yMax = ko.observable(null);
		self.yMin = ko.observable(null);
		self.yMid = ko.computed(function() { return (self.yMax() + self.yMin()) / 2; }, self);
		self.zMax = ko.observable(null);
		self.zMin = ko.observable(null);
		self.hMill = ko.observable(30);
		self.dMill = ko.observable(3*25.4);
		self.dProbe = ko.observable(3/8*25.4);

		self.opposite = function(direction) {
			if(direction == "X+") { return "X-"; }
			if(direction == "X-") { return "X+"; }
			if(direction == "Y+") { return "Y-"; }
			if(direction == "Y-") { return "Y+"; }
		};

		self.travel = function(direction) {
			if(direction == "X+") { return "Y+"; }
			if(direction == "X-") { return "Y-"; }
			if(direction == "Y+") { return "X-"; }
			if(direction == "Y-") { return "X+"; }
		};

		self.next = function(direction) {
			if(direction == "X+") { return "Y-"; }
			if(direction == "X-") { return "Y+"; }
			if(direction == "Y+") { return "X+"; }
			if(direction == "Y-") { return "X-"; }
		};

		self.trace = function() {
			self.xMin(1000);
			self.xMax(-1000);
			self.yMin(1000);
			self.yMax(-1000);
			self.mode = "trace";
			self.dir = "X+";
			OctoPrint.control.sendGcode("M400 G38.3 X+100 G91 G0 X-1")
		}

		self.probe_rect = function() {
			self.xMin(null); self.xMax(null);
			self.yMin(null); self.yMax(null);
			self.zMin(null); self.zMax(null);
			self.mode = "probe_rect";
			self.travelDir = "X+";
			self.probeDir = "Z-";
			OctoPrint.control.sendGcode("M400 G38.3 Z-100 G91 G0 Z+1 M400");
		}

		self.findXmax = function() {
			self.mode = "x_max";
			OctoPrint.control.sendGcode("M400 G38.3 X-100");
		}

		self.findXmid = function() {
			self.mode = "x_mid";
			//self.dir = "X-";
			// Probe
			//OctoPrint.control.sendGcode("M400 G38.3 X-100");
		}

		self.findXmin = function() {
			self.mode = "x_min";
			OctoPrint.control.sendGcode("M400 G38.3 X+100");
		}

		self.gotoXmax = function() {
			var offset = self.offset() ? self.dMill()/2 : 0;
			OctoPrint.control.sendGcode("M400 G90 G0 X" + Number(self.xMax() + offset))
		}

		self.gotoXmid = function() {
			OctoPrint.control.sendGcode("M400 G90 G0 X" + self.xMid())
		}

		self.gotoXmin = function() {
			var offset = self.offset() ? self.dMill()/2 : 0;
			OctoPrint.control.sendGcode("M400 G90 G0 X" + Number(self.xMin() - offset))
		}

		self.findYmax = function() {
			self.mode = "y_max";
			OctoPrint.control.sendGcode("M400 G38.3 Y-100");
		}

		self.findYmid = function() {
			self.mode = "y_mid";
			self.dir = "Y+";
			// Probe
			OctoPrint.control.sendGcode("M400 G38.3 Y+100");
		}

		self.findYmin = function() {
			self.mode = "y_min";
			OctoPrint.control.sendGcode("M400 G38.3 Y+100");
		}

		self.gotoYmax = function() {
			var offset = self.offset() ? self.dMill()/2 : 0;
			OctoPrint.control.sendGcode("M400 G90 G0 Y" + Number(self.yMax() + offset))
		}

		self.gotoYmid = function() {
			OctoPrint.control.sendGcode("M400 G90 G0 Y" + self.yMid())
		}

		self.gotoYmin = function() {
			var offset = self.offset() ? self.dMill()/2 : 0;
			OctoPrint.control.sendGcode("M400 G90 G0 Y" + Number(self.yMin() - offset))
		}

		self.findZmax = function() {
			self.mode = "z_max";
			OctoPrint.control.sendGcode("M400 G38.3 Z-100");
		}

		self.gotoZmax = function() {
			OctoPrint.control.sendGcode("M400 G90 G0 Z" + self.zMax())
		}

		self.stage = function() {
			var offset = self.offset() ? self.dMill()/2 : 0;

			var xStage = self.cutLR() && !self.cutRL() ? self.xMin() - offset : self.xMax() + offset;

			OctoPrint.control.sendGcode([
				"G90",
				"G0 X" + xStage + " Z" + self.zMax(),
				"M18"
			]);
		}

		self.run = function() {
			let fullCut = self.zMax() - self.zMin();
			let remainingPasses = Math.ceil( fullCut / self.hMill() );
			let passCut = fullCut / remainingPasses;

			let offset = self.offset() ? self.dMill()/2 : 0;

			let moveRight = self.cutLR() && !self.cutRL();

			let code = ["G90"];

			while(remainingPasses >= 0) {
				if(moveRight) { // Next move is Left-to-Right
					if(self.cutLR()) { // Next move is a cut
						code.push("G1 Z" + (self.zMax() - (fullCut - passCut*remainingPasses)) + " F" + self.g1feed() + " M400");
						code.push("G1 X" + (self.xMax() + offset) + " F" + self.g1feed() + " M400");
						remainingPasses--;
					} else { // Next move is a rapid spring pass
						code.push("G0 X" + (self.xMax() + offset) + " F" + self.g0feed() + " M400");
					}
					moveRight = false;
				} else { // Next move is Right-to-Left
					if(self.cutRL()) { // Next move is a cut
						code.push("G1 Z" + (self.zMax() - (fullCut - passCut*remainingPasses)) + " F" + self.g1feed() + " M400");
						code.push("G1 X" + (self.xMin() - offset) + " F" + self.g1feed() + " M400");
						remainingPasses--;
					} else { // Next move is a rapid spring pass
						code.push("G0 X" + (self.xMin() - offset) + " F" + self.g0feed() + " M400");
					}
					moveRight = true;
				}
			}
			code.push("G0 Z" + self.zMax() + " F" + self.g0feed());
			code.push("M18");
			OctoPrint.control.sendGcode(code);
		}

		self.fromCurrentData = function(data) {
			_.each(data.logs, function (line) {
				if(self.mode == "x_max") {
					if(match = self.probeHit.exec(line)) {
						self.xMax(Number(match[1]) - self.dProbe()/2);
						self.mode = "";
						OctoPrint.control.sendGcode(["G91 G0 X+1"]);
					}
				} else if(self.mode == "x_min") {
					if(match = self.probeHit.exec(line)) {
						self.xMin(Number(match[1]) + self.dProbe()/2);
						self.mode = "";
						OctoPrint.control.sendGcode(["G91 G0 X-1"]);
					}
				} else if(self.mode == "y_max") {
					if(match = self.probeHit.exec(line)) {
						self.yMax(Number(match[2]) - self.dProbe()/2);
						self.mode = "";
						OctoPrint.control.sendGcode(["G91 G0 Y+1"]);
					}
				} else if(self.mode == "y_mid") { // If we're finding y-mid
					if(match = self.probeHit.exec(line)) {
						//alert("Received y_mid data");
						if(self.dir === "Y+") {
							self.dir = "Y-"
							self.yMax(Number(match[2]));
							//alert("yMax is " + self.yMax);
							OctoPrint.control.sendGcode([
								"G91 G0 Y-1",
								"M400",
								"G38.3 Y-100"
							]);
						} else {
							self.mode = "";
							self.yMin(Number(match[2]));
							OctoPrint.control.sendGcode([
								"G90",
								"G0 Y" + self.yMid(),
								"G91"
							]);
						}
					}
				} else if(self.mode == "y_min") {
					if(match = self.probeHit.exec(line)) {
						self.yMin(Number(match[2]) + self.dProbe()/2);
						self.mode = "";
						OctoPrint.control.sendGcode(["G91 G0 Y-1"]);
					}
				} else if(self.mode == "z_max") {
					if(match = self.probeHit.exec(line)) {
						self.zMax(Number(match[3]));
						self.mode = "";
						OctoPrint.control.sendGcode(["G91 G0 Z+1"]);
					}
				} else if(self.mode == "z_min") {
					if(match = self.probeHit.exec(line)) {
						self.zMin(Number(match[3]));
						self.mode = "";
					}
				} else if(self.mode == "probe_rect") { // If we're probing rectangular stock dimensions and location
					// If we hit the stock
					if(match = self.probeHit.exec(line)) {
						x = Number(match[1]);
						y = Number(match[2]);
						z = Number(match[3]);

						if(self.xMax() == null || x > self.xMax() + self.dProbe()/2) { self.xMax(x - self.dProbe()/2) }
						if(self.xMin() == null || x < self.xMin() - self.dProbe()/2) { self.xMin(x + self.dProbe()/2) }
						if(self.yMax() == null || y > self.yMax() + self.dProbe()/2) { self.yMax(y - self.dProbe()/2) }
						if(self.yMin() == null || y < self.yMin() - self.dProbe()/2) { self.yMin(y + self.dProbe()/2) }
						if(self.zMax() == null || z > self.zMax()) { self.zMax(z) }
						if(self.zMin() == null || z < self.zMin()) { self.zMin(z) }

						if(self.probeDir == "Z-") {
							OctoPrint.control.sendGcode([
								"G91",										// Relative mode
								"G0 " + self.travelDir + self.travelDist,	// Travel along the stock
								"G38.3 Z-5",								// Probe
								"G0 Z+1",									// Retract from the surface
								"M400"										// Wait for queue to clear
							]);
						} else if(self.probeDir == "X-") { // We hit xMax
							self.travelDir = "X-";
							self.probeDir = "Z-";
							OctoPrint.control.sendGcode([
								"G91", 						// Relative mode
								"G0 Z+5", 					// Move back above zMax
								"G90",						// Absolute mode
								"G0 X" + self.xMin(),		// Move to whatever xMin has been set to thus far
								"G91",						// Relative mode
								"G0 X-" + self.travelDist,	// Travel to the next probe point
								"M400",						// Wait for queue to clear
								"G38.3 Z-5",				// Probe
								"G0 Z+1",					// Retract from the surface
								"M400"						// Wait for queue to clear
							]);
						} else if(self.probeDir == "X+") { // We hit xMin
							self.travelDir = "Y+";
							self.probeDir = "Z-";
							OctoPrint.control.sendGcode([
								"G91", 						// Relative mode
								"G0 Z+5", 					// Move back above zMax
								"G90",						// Absolute mode
								"G0 X" + self.xMid(),		// Move to xMid since we know that now
								"G91",						// Relative mode
								"G0 Y" + self.travelDist,	// Travel to the next probe point
								"M400",						// Wait for queue to clear
								"G38.3 Z-5",				// Probe
								"G0 Z+1",					// Retract from the surface
								"M400"						// Wait for queue to clear
							]);
						} else if(self.probeDir == "Y-") { // We hit yMax
							self.travelDir = "Y-";
							self.probeDir = "Z-";
							OctoPrint.control.sendGcode([
								"G91", 						// Relative mode
								"G0 Z+5", 					// Move back above zMax
								"G90",						// Absolute mode
								"G0 Y" + self.yMin(),		// Move to whatever yMin has been set to thus far
								"G91",						// Relative mode
								"G0 Y-" + self.travelDist,	// Travel to the next probe point
								"M400",						// Wait for queue to clear
								"G38.3 Z-5",				// Probe
								"G0 Z+1",					// Retract from the surface
								"M400"						// Wait for queue to clear
							]);
						} else if(self.probeDir == "Y+") { // We hit yMin
							self.travelDir = null;
							self.probeDir = null;
							self.mode = null;
							OctoPrint.control.sendGcode([
								"G91", 													// Relative mode
								"G0 Z+5", 												// Move back above zMax
								"G90",													// Absolute mode
								"G0 X" + self.xMid() + " Y" + self.yMid(),	// Move to (xMid,yMid) since we know that now
								"M400",													// Wait for queue to clear
								"M18"														// Steppers off
							]);

							var dimX = self.xMax()-self.xMin();
							var dimY = self.yMax()-self.yMin();

							alert("dimX: " + dimX + " dimY:  " + dimY);
						}
					// Didn't hit anything -- must be at an edge
					} else if(self.probeMiss.exec(line)) {
						self.probeDir = self.opposite(self.travelDir);
						OctoPrint.control.sendGcode([
							"G91",											// Relative mode
							"G38.3 " + self.probeDir + self.travelDist,		// Probe the edge
							"G0 " + self.opposite(self.probeDir) + "1"		// Retract from the edge
						])

					}
				} else if(self.mode == "trace") { // If we're tracing
					// If we run into something while G38.3ing
					if(match = self.probeHit.exec(line)) {
						// Make sure we're relative
						// Back off the target a bit
						// OctoPrint.control.sendGcode("M400 G91 G0 " + self.opposite(self.dir) + "1");

						// Grab X and Y from the PRB: response
						match[1] = Number(match[1]);
						match[2] = Number(match[2]);
						// Track X/Y Max/Min
						//		  console.log(match[1] + " <=> " + self.xMax);
						if(match[1] > self.xMax() + self.dProbe()/2) { self.xMax(match[1] - self.dProbe()/2) }
						if(match[1] < self.xMin() - self.dProbe()/2) { self.xMin(match[1] + self.dProbe()/2) }
						if(match[2] > self.yMax() + self.dProbe()/2) { self.yMax(match[2] - self.dProbe()/2) }
						if(match[2] < self.yMin() - self.dProbe()/2) { self.yMin(match[2] + self.dProbe()/2) }

						console.log(match[0]);

						// Travel perpendicular to the target and wait for queue to clear
						OctoPrint.control.sendGcode("M400 G0 " + self.travel(self.dir) + self.travelDist);
						// Probe
						OctoPrint.control.sendGcode("M400 G4S1 M400 G38.3 " + self.dir + self.travelDist + " G91 G0 " + self.opposite(self.dir) + "1");
						// Probed but didn't hit anything -- probably a corner
					} else if(self.probeMiss.exec(line)) {
						// Round the corner
						self.dir = self.next(self.dir);
						// If we're back to the beginning
						if(self.dir == "X+") {
							// Steppers off
							OctoPrint.control.sendGcode("M18");
							// Clear mode
							self.mode = "";

							var dimX = self.xMax()-self.xMin();
							var dimY = self.yMax()-self.yMin();

							alert("dimX: " + dimX + " dimY:  " + dimY);

						} else {
							// Probe
							OctoPrint.control.sendGcode("M400 G38.3 " + self.dir + (self.travelDist+2) + " G91 G0 " + self.opposite(self.dir) + "1");
						}
					}
				}
			});
		};

		self.homeZ = function() {
			self.mode = "trace";
			self.dir = "X+";
			self.xMax = -100000;
			self.xMin = 100000;
			self.yMax = -100000;
			self.yMin = 100000;
			// Make sure we're relative
			OctoPrint.control.sendGcode("G91");
			// Probe
			OctoPrint.control.sendGcode("M400 G38.3 " + self.dir + 50);
		}
	};



	// This is how our plugin registers itself with the application, by adding some configuration
	// information to the global variable OCTOPRINT_VIEWMODELS
	OCTOPRINT_VIEWMODELS.push([
		// This is the constructor to call for instantiating the plugin
		MillViewModel,

		// This is a list of dependencies to inject into the plugin, the order which you request
		// here is the order in which the dependencies will be injected into your view model upon
		// instantiation via the parameters argument
		["settingsViewModel"],

		// Finally, this is the list of selectors for all elements we want this view model to be bound to.
		["#tab_plugin_mill"]
	]);
});
