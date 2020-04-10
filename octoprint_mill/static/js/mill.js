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

		// Probe diameter (mm)
		self.diameter = 3;

		self.xMax = ko.observable(0);
		self.xMin = ko.observable(0);
		self.yMax = ko.observable(0);
		self.yMin = ko.observable(0);
		self.yMid = ko.computed(function() { return (self.yMax() + self.yMin()) / 2; }, self);
		self.zMax = ko.observable(0);
		self.zMin = ko.observable(-50);
		self.hMill = ko.observable(30);
		self.dMill = ko.observable(0);

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

		self.findYcenter = function() {
			self.mode = "y_center";
			self.dir = "Y+";
			// Probe
			OctoPrint.control.sendGcode("M400 G38.3 Y+100");
			//alert("Starting findYcenter");
		}

		// Recv: ok C: X:0.0000 Y:32.9045 Z:0.0000
		self.position = /X:(.*?) Y:(.*?) Z:(.*?)$/;

		self.setXmax = function() {
			self.mode = "x_max";
			OctoPrint.control.sendGcode("M114");
		}

		self.setXmin = function() {
			self.mode = "x_min";
			OctoPrint.control.sendGcode("M114");
		}

		self.setZmax = function() {
			self.mode = "z_max";
			OctoPrint.control.sendGcode("M114");
		}

		self.setZmin = function() {
			self.mode = "z_min";
			OctoPrint.control.sendGcode("M114");
		}

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
						self.xMax(Number(match[1]));
						self.mode = "";
					}
				} else if(self.mode == "x_min") {
					if(match = self.position.exec(line)) {
						self.xMin(Number(match[1]));
						self.mode = "";
					}
				} else if(self.mode == "z_max") {
					if(match = self.position.exec(line)) {
						self.zMax(Number(match[3]));
						self.mode = "";
					}
				} else if(self.mode == "z_min") {
					if(match = self.position.exec(line)) {
						self.zMin(Number(match[3]));
						self.mode = "";
					}
				} else if(self.mode == "y_center") { // If we're finding y-center
					if(match = self.probeHit.exec(line)) {
						//alert("Received y_center data");
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
				} else if(self.mode == "trace") { // If we're tracing
					// If we run into something while G38.3ing
					if(match = self.probeHit.exec(line)) {
						match[1] = Number(match[1]);
						match[2] = Number(match[2]);
						// Track X/Y Max/Min
						//		  console.log(match[1] + " <=> " + self.xMax);
						if((match[1]) > self.xMax) {
							//		     console.log(match[1] + " > " + self.xMax);
							self.xMax = match[1]
						}
						if(match[1] < self.xMin) { self.xMin = match[1] }
						if(match[2] > self.yMax) { self.yMax = match[2] }
						if(match[2] < self.yMin) { self.yMin = match[2] }

						console.log(match[0]);

						// Make sure we're relative
						OctoPrint.control.sendGcode("G91");
						// Back off the target a bit
						OctoPrint.control.sendGcode("G0 " + self.opposite(self.dir) + "1");
						// Travel perpendicular to the target and wait for queue to clear
						OctoPrint.control.sendGcode("G0 " + self.travel(self.dir) + self.travelDist);
						// Probe
						OctoPrint.control.sendGcode("G4S1 M400 G38.3 " + self.dir + self.travelDist );
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

							var width = self.xMax-self.xMin-self.diameter;
							var height = self.yMax-self.yMin-self.diameter;

							var xScale = 25.4/width;
							var yScale = 2*25.4/height;

							alert("Scale Y: " + yScale + " Scale X: " + xScale);

						} else {
							// Probe
							OctoPrint.control.sendGcode("M400 G38.3 " + self.dir + (self.travelDist+2));
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
