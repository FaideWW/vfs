var canvas = document.getElementById('canvas');

var _ = new alien.Game({
	'canvas': canvas
});

var red = new alien.Entity({
	'position': new alien.Math.Vector({
		x: 100,
		y: 100,
		z: 0.5
	}),
	'renderables': [new alien.components.renderable.Polygon({
		color: "rgba(75,0,0,1)",
		points: [
			new alien.Math.Vector({
				x: -50,
				y: -50
			}),
			new alien.Math.Vector({
				x: 50,
				y: -50
			}),
			new alien.Math.Vector({
				x: 50,
				y: 50
			}),
			new alien.Math.Vector({
				x: -50,
				y: 50
			})
		]
	})],
	'behaviors': [new alien.components.behavior.Draggable()],
	'collidable': new alien.components.collidable.AABB({
		half_width: 50,
		half_height: 50
	})
});


var blue = new alien.Entity({
	'renderables': [new alien.components.renderable.Sprite({
		src: 'game/assets/sprite.png'
	})],
	'collidable': new alien.components.collidable.AABB({
		half_width: 16,
		half_height: 16
	})

});
blue.behaviors = [
	new alien.components.behavior.DrawLineBetween(),
	new alien.components.behavior.Draggable()
];



blue.set('position', new alien.Math.Vector({ x: 150, y: 450,	z: 0.6 }));

var listener = new alien.Entity();
listener.on('keydown', function(e, data) {
	if (data.event.keyCode === 32) {
		if (_.running) {
			_.stop();
		} else {
			_.run();
		}
	}
});

var text = new alien.Entity({
	position: new alien.Math.Vector({
		x: 200,
		y: 200,
		z: 1
	}),
	renderables: [new alien.components.renderable.Text()],
	behaviors: [new alien.components.behavior.Follow({
		target: 'mouse',
		callback: function(e) {
			e.renderables[0].text = e.getPosition().x + ", " + e.getPosition().y;
		}
	})]
});

var ground = new alien.Entity({
	position: new alien.Math.Vector({
		x: 640,
		y: 710
	}),
	renderables: [new alien.components.renderable.Polygon({
		color: "rgba(0,75,0,1)",
		points: [
			new alien.Math.Vector({
				x:-640,
				y: -40
			}),
			new alien.Math.Vector({
				x:640,
				y: -40
			}),
			new alien.Math.Vector({
				x:640,
				y: 40
			}),
			new alien.Math.Vector({
				x:-640,
				y: 40
			}),
		]
	})],
	collidable: new alien.components.collidable.AABB({
		half_width: 640,
		half_height: 40
	}),
	staticObject: true
});

blue.on('collide', function(e, data) {
	if ((data.entity.staticObject || data.entity.on_ground) && data.collision.x === 0) {
		e.on_ground = true;
	}
	e.position = e.position.sub(data.collision);
}).massless = false;

red.staticObject = true;

var controller = new alien.components.Controller({
	control_entity: blue,
	keymap: {
		'w,up': {
			down: function(e, data) {
				if (e.on_ground) {
					e.on_ground = false;
					e.velocity.y = -3000;
				}
			},
			up: function(e, data) {}
		},
		'a,left': {
			down: function(e, data) {
				e.velocity.x -= 1500;
			},
			up: function(e, data) {
				e.velocity.x += 1500;
			}
		},
		's,down': {
			down: function(e, data) {
				console.log('down');
			},
			up: function(e, data) {}
		},
		'd,right': {
			down: function(e, data) {
				e.velocity.x += 1500;
			},
			up: function(e, data) {
				e.velocity.x -= 1500;
			}
		}
	}
});

var sprite = new alien.Entity({
	renderables: [new alien.components.renderable.Sprite({
		src: 'game/assets/sprite.png'
	})],
	position: new alien.Math.Vector({
		x: 400,
		y: 100
	})
});

var s1 = new alien.Scene({
		entities: [
			red,
			blue,
			ground,
			text,
			listener
		]
});





_.setScene(s1);
_.registerEventListeners(_.canvas, _.scene);

