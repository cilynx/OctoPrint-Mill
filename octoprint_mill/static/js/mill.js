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

		// Probe mode: "backlash", "backtrace", "trace"
		self.mode = "";

		// Travel distance (mm) between probes
		self.travelDist = 10;

		self.offset = ko.observable(false);
		self.cut = ko.observable(false);
		self.xMax = ko.observable(-1000);
		self.xMin = ko.observable(1000);
		self.xMid = ko.computed(function() { return (self.xMax() + self.xMin()) / 2; }, self);
		self.yMax = ko.observable(-1000);
		self.yMin = ko.observable(1000);
		self.yMid = ko.computed(function() { return (self.yMax() + self.yMin()) / 2; }, self);
		self.zMax = ko.observable(0);
		self.zMin = ko.observable(-50);
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
			OctoPrint.control.sendGcode("M400 G38.3 X+100 G91 G0 X-1")
			self.xMin(1000);
			self.xMax(-1000);
			self.yMin(1000);
			self.yMax(-1000);
			self.mode = "trace";
			self.dir = "X+";
			OctoPrint.control.sendGcode("M400 M114");
		}

		self.findXmax = function() {
			OctoPrint.control.sendGcode("M400 G38.3 X-100")
			self.mode = "x_max";
			OctoPrint.control.sendGcode("M400 M114");
		}

		self.findXmid = function() {
			self.mode = "x_mid";
			//self.dir = "X-";
			// Probe
			//OctoPrint.control.sendGcode("M400 G38.3 X-100");
		}

		self.findXmin = function() {
			OctoPrint.control.sendGcode("M400 G38.3 X+100")
			self.mode = "x_min";
			OctoPrint.control.sendGcode("M400 M114");
		}

		self.gotoXmax = function() {
			var offset = self.offset() ? self.dMill()/2 : 0;
			OctoPrint.control.sendGcode("M400 G90 G" + Number(self.cut()) + " X" + Number(self.xMax() + offset))
		}

		self.gotoXmid = function() {
			OctoPrint.control.sendGcode("M400 G90 G" + Number(self.cut()) + " X" + self.xMid())
		}

		self.gotoXmin = function() {
			var offset = self.offset() ? self.dMill()/2 : 0;
			OctoPrint.control.sendGcode("M400 G90 G" + Number(self.cut()) + " X" + Number(self.xMin() - offset))
		}

		self.findYmax = function() {
			OctoPrint.control.sendGcode("M400 G38.3 Y-100")
			self.mode = "y_max";
			OctoPrint.control.sendGcode("M400 M114");
		}

		self.findYmid = function() {
			self.mode = "y_mid";
			self.dir = "Y+";
			// Probe
			OctoPrint.control.sendGcode("M400 G38.3 Y+100");
		}

		self.findYmin = function() {
			OctoPrint.control.sendGcode("M400 G38.3 Y+100")
			self.mode = "y_min";
			OctoPrint.control.sendGcode("M400 M114");
		}

		self.gotoYmax = function() {
			var offset = self.offset() ? self.dMill()/2 : 0;
			OctoPrint.control.sendGcode("M400 G90 G" + Number(self.cut()) + " Y" + Number(self.yMax() + offset))
		}

		self.gotoYmid = function() {
			OctoPrint.control.sendGcode("M400 G90 G" + Number(self.cut()) + " Y" + self.yMid())
		}

		self.gotoYmin = function() {
			var offset = self.offset() ? self.dMill()/2 : 0;
			OctoPrint.control.sendGcode("M400 G90 G" + Number(self.cut()) + " Y" + Number(self.yMin() - offset))
		}

		self.findZmax = function() {
			OctoPrint.control.sendGcode("M400 G38.3 Z-100")
			self.mode = "z_max";
			OctoPrint.control.sendGcode("M400 M114");
		}

		self.gotoZmax = function() {
			OctoPrint.control.sendGcode("M400 G90 G" + Number(self.cut()) + " Z" + self.zMax())
		}

		// Recv: ok C: X:0.0000 Y:32.9045 Z:0.0000
		self.position = /X:(.*?) Y:(.*?) Z:(.*?)$/;

		self.stage = function() {
			OctoPrint.control.sendGcode([
				"G90",
				"G0 X" + self.xMax(),
				"G0 Y" + self.yMid(),
				"G0 Z" + self.zMin()
			]);
		}

		self.run = function() {
			full_cut = self.zMax() - self.zMin();
			passes = Math.ceil( full_cut / self.hMill() );
			pass_cut = full_cut / passes;
			code = "G90\n";
			for(i = 1; i <= passes; i++) {
				code += "G0 Z" + (self.zMax() - pass_cut*i) + "\n";
				code += "G1 X" + self.xMin() + "\n";
//				code += "G0 Z" + self.zMax() + "\n";
				code += "G0 X" + self.xMax() + "\n";
			}
			code += "G0 Z" + self.zMin();
			OctoPrint.control.sendGcode(code.split("\n"));
		}

		self.fromCurrentData = function(data) {
			_.each(data.logs, function (line) {
				if(self.mode == "x_max") {
					if(match = self.position.exec(line)) {
						self.xMax(Number(match[1]) - self.dProbe()/2);
						self.mode = "";
						OctoPrint.control.sendGcode(["G91 G0 X+1"]);
					}
				} else if(self.mode == "x_min") {
					if(match = self.position.exec(line)) {
						self.xMin(Number(match[1]) + self.dProbe()/2);
						self.mode = "";
						OctoPrint.control.sendGcode(["G91 G0 X-1"]);
					}
				} else if(self.mode == "y_max") {
					if(match = self.position.exec(line)) {
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
					if(match = self.position.exec(line)) {
						self.yMin(Number(match[2]) + self.dProbe()/2);
						self.mode = "";
						OctoPrint.control.sendGcode(["G91 G0 Y-1"]);
					}
				} else if(self.mode == "z_max") {
					if(match = self.position.exec(line)) {
						self.zMax(Number(match[3]));
						self.mode = "";
						OctoPrint.control.sendGcode(["G91 G0 Z+1"]);
					}
				} else if(self.mode == "z_min") {
					if(match = self.position.exec(line)) {
						self.zMin(Number(match[3]));
						self.mode = "";
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
