/**
 * Created by faide on 2014-04-18.
 */

define(['underscore', 'alien/utilities/math', 'alien/components/collidable', 'alien/logging', 'alien/components/message',
    'alien/systems/physics', 'alien/systems/render', 'alien/systems/event',
    'alien/systems/messaging'], function (_, M, CF, Log, Message, Physics, Render, Event, Messaging) {
    'use strict';

    var AABB_faces = [
        new M.Vector({x: -1, y: 0}),
        new M.Vector({x: 0, y: 1}),
        new M.Vector({x: 1, y: 0}),
        new M.Vector({x: 0, y: -1})
    ];

    /**
     * Returns an AABB approximation of the bounding polygon, for a less accurate (but faster) collision detection
     * @param polygon : Polygon - point data for the polygon
     */
    return {
        step: function (scene, dt) {
            Messaging.fetch('collision');
            /*
             Build a list of possible collisions using broad-phase collision detection
             (at the moment we just combine one non-static entity and any other entity)
             */
            var entities            = scene.getAllWithAllOf(['collidable', 'position']),
                nonstatic_entities  = _.where(entities, {isStatic: false}),
                static_entities     = _.where(entities, {isStatic: true}).concat(scene.map.getCollidables()),
                possible_collisions = [],
                collisions,
                i,
                j,
                l = nonstatic_entities.length,
                m = static_entities.length;

            /*
             Broad phase
             */


            for (i = 0; i < l; i += 1) {
                /* Do geometry collision first */
                for (j = 0; j < m; j += 1) {
                    possible_collisions.push({
                        collider: nonstatic_entities[i],
                        other: static_entities[j]
                    });
                }


                /* Add non-static entities */
                for (j = i + 1; j < l; j += 1) {
                    possible_collisions.push({
                        collider: nonstatic_entities[i],
                        other: nonstatic_entities[j]
                    });
                }
            }

            collisions = this.collide(possible_collisions);
            Log.log(possible_collisions.length + ' possible collisions; ' + collisions.length + ' actual collisions');
            if (collisions.length) {
                //debugger;
                Messaging.enqueue('collisionresolution', _.map(collisions, function (manifold) {
                    return new Message(manifold, function (m) {
                        var toShift,
                            other,
                            manifold;
                        if (m.collider.isStatic) {
                            //The "collider" is static; we need to move the other component
                            toShift  = m.other;
                            other    = m.collider;
                            manifold = m.manifold.mul(-1);
                        } else {
                            toShift  = m.collider;
                            other    = m.other;
                            manifold = m.manifold;
                        }
                        Physics.shift(toShift, manifold);
                        Physics.flatten(toShift, manifold);
                        //debugger;
                        Event.trigger('collide', m.collider, {
                            other:    other,
                            manifold: manifold
                        });
                        Event.trigger('collide', m.other, {
                            other:    other,
                            manifold: manifold
                        });
                    });
                }));
            }

        },
        /*
         Accepts a list of possible collisions (pruned or not) that must be checked;
         Returns an in-order list of the actual collisions that have occurred
         */
        collide: function (possible_collisions) {
            return _.compact(_.map(possible_collisions, function (collision, index) {
                /**
                 * Collidable components can degrade from bounding circle to AABB to polygon as necessary
                 *
                 */

                var collider = collision.collider,
                    other    = collision.other,
                    manifold = new M.Vector(),
                    reversed = false,
                    c = this.collisionMethods,
                    collider_face,
                    other_face,
                    getCollidedFace = function (normals) {
                        return _.max(_.map(normals, function (axis, index) {
                            return {
                                dot:   axis.dot(manifold),
                                index: index
                            };
                        }), function (dot) {
                            return dot.dot;
                        }).index;
                    };

                if (collider.collidable.type !== undefined && other.collidable.type !== undefined) {
                    /*
                     Each collider type is mapped to an integer, so that we can sum the two types and determine the
                     requisite tests to be performed
                     (types can be 0, so an explicit undefined check must be performed)
                     */

                    /* TODO: Check for applied rotations or scaling */


                    if (collider.collidable.type + other.collidable.type === -2) {
                        /*
                         -------------------------------------
                         CIRCLE-CIRCLE COLLISION
                         -------------------------------------
                         */
                        manifold = c.collideCircleCircle(collider.position, other.position, collider.collidable.radius,
                            other.collidable.radius, false);
                    } else if (collider.collidable.type + other.collidable.type === -1) {
                        /*
                         -------------------------------------
                         CIRCLE-AABB COLLISION
                         -------------------------------------
                         */
                        if (collider.collidable.type === CF.collidables.AABB) {
                            /* reverse the operation */
                            collider = collision.other;
                            other    = collision.collider;
                            reversed = true;
                        }
                        manifold = c.collideCircleAABB(collider.position, other.position, collider.collidable.radius,
                            other.collidable, false, reversed);

                        /**
                         * Determine the face collided with
                         * The collided face's normal has the largest dot product with the collision manifold
                         *
                         * Underscore's max function returns the actual normal vector but we need the index of that
                         * normal within the list of faces, so we map the index into the list before calculating the max
                         */
                        other_face = getCollidedFace(AABB_faces);

                    } else if (collider.collidable.type && !(collider.collidable.type + other.collidable.type)) {
                        /*
                         -------------------------------------
                         CIRCLE-POLYGON COLLISION
                         -------------------------------------

                         Since the type-sum of circle (-1) + polygon (1) is the same as aabb (0) + aabb (0),
                         we perform an additional falsey check against one of the types
                         */
                        if (collider.collidable.type === CF.collidables.POLYGON) {
                            /* reverse the operation */
                            collider = collision.other;
                            other    = collision.collider;
                            reversed = true;
                        }

                        /* perform an approximate circle-circle test first, for short-circuiting */
                        if (!c.collideCircleCircle(collider.position, other.position, collider.collidable.radius,
                                this.componentMethods.polyToCircle(other.collidable).radius, true)) {
                            return false;
                        }

                        /* If the approximation returns true, perform the real test */
                        manifold = c.collideCirclePoly(collider.position, other.position, collider.collidable.radius,
                            other.collidable, false, reversed);
                        /* Determine collided faces */
                        other_face = getCollidedFace(other.collidable.getNormals());

                    } else if (collider.collidable.type + other.collidable.type === 0) {
                        /*
                         -------------------------------------
                         AABB-AABB COLLISION
                         -------------------------------------

                         Note: this type-sum is the same as circle-poly; see above for explanation
                         */
                        manifold = c.collideAABBAABB(collider.position, other.position, collider.collidable, other.collidable);
                        collider_face = getCollidedFace(AABB_faces, manifold.mul(-1));
                        other_face    = getCollidedFace(AABB_faces, manifold);

                    } else if (collider.collidable.type + other.collidable.type === 1) {
                        /*
                         -------------------------------------
                         AABB-Poly COLLISION
                         -------------------------------------
                         */
                        if (collider.collidable.type === CF.collidables.POLYGON) {
                            collider = collision.other;
                            other    = collision.collider;
                            reversed = true;
                        }

                        /* perform an approximate AABB test for a fast short-circuit */
                        if (!c.collideCircleAABB(other.position, collider.position,
                                this.componentMethods.polyToCircle(other.collidable).radius, collider.collidable, true)) {
                            return false;
                        }

                        /* if the approximation returns true, perform the true test */
                        manifold = c.collideSAT(collider.position, other.position,
                            this.componentMethods.aabbToPoly(collider.collidable), other.collidable);

                        collider_face = getCollidedFace(AABB_faces, manifold.mul(-1));
                        other_face    = getCollidedFace(other.collidable.getNormals(), manifold);
                    } else if (collider.collidable.type + other.collidable.type === 2) {
                        /*
                         -------------------------------------
                         Poly-Poly COLLISION
                         -------------------------------------
                         */
                        manifold = c.collideSAT(collider.position, other.position, collider.collidable, other.collidable, false);
                        collider_face = getCollidedFace(collider.collidable.getNormals(), manifold.mul(-1));
                        other_face    = getCollidedFace(other.collidable.getNormals(), manifold);
                    }
                    if (manifold.magsqrd()) {

                        return {
                            manifold:      manifold,
                            collider:      collider,
                            collider_face: collider_face,
                            other:         other,
                            other_face:    other_face
                        };
                    }
                    return false;
                }
                return false;
            }, this));
        },

        /**
         * Collision methods
         *
         * There are currently three supported collidable types:
         * - Bounding Circle
         * - Axis-aligned Bounding Box
         * - Convex Polygon
         *
         * Depending on the types being collided, different methods will be used.  These methods are as follows:
         *
         * Circle vs Circle : collideCircleCircle
         * Circle vs AABB   : collideCircleAABB
         * Circle vs Poly   : collideCirclePoly
         * AABB   vs AABB   : collideAABBAABB
         * AABB   vs Poly   : collideSAT
         * Poly   vs Poly   : collideSAT
         */
        collisionMethods: {
            /**
             * Bounding Circle vs Bounding Circle collision test
             *
             * Tests whether the distance between two bounding circles from center to center is less than the sum of
             *  their radii.
             *
             * @param position1 : Vector - center of the first BC
             * @param position2 : Vector - center of the second BC
             * @param radius1   : Number - distance from center to edge of first BC
             * @param radius2   : Number - distance from center to edge of first BC
             * @param fast      : Bool   - whether to return a boolean value (cheap),
             *                              or a calculated collision vector (expensive)
             */
            collideCircleCircle: function (position1, position2, radius1, radius2, fast) {

                /* It's faster to square a number than to take its square root, so we compare squared values*/
                var distSquared = position1.sub(position2).magsqrd(),
                    radSquared = (radius1 + radius2) * (radius1 + radius2),
                    dist,
                    scalar;

                if (fast) {
                    return distSquared < radSquared;
                }
                dist = Math.sqrt(distSquared);
                scalar = (radius1 + radius2) - dist;
                return (scalar > 0) ? position1.sub(position2).unt().mul(-scalar) : new M.Vector();

            },
            /**
             * Bounding circle vs Axis-aligned bounding box test
             *
             * Tests whether the closest point on the AABB to the bounding circle is closer than
             *  the radius of the circle.
             *
             * @param circle_position : Vector - center of the bounding circle
             * @param aabb_position   : Vector - center of the AABB
             * @param radius          : Number - distance from center to edge of BC
             * @param aabb            : AABB   - information on half_width and half_height of the AABB
             * @param fast            : Bool   - whether to return a boolean value or calculated collision vector
             * @param reverse         : Bool   - whether the circle or the AABB is the collider
             */
            collideCircleAABB: function (circle_position, aabb_position, radius, aabb, fast, reverse) {
                var dist = circle_position.sub(aabb_position),
                    closest_point = new M.Vector({
                        x: M.clamp(dist.x, -aabb.half_width, aabb.half_width),
                        y: M.clamp(dist.y, -aabb.half_height, aabb.half_height)
                    }),
                    inside = false,
                    axis;

                if (closest_point.eq(dist)) {
                    /* The circle's position is inside the AABB */
                    inside = true;
                    if (Math.abs(dist.x) > Math.abs(dist.y)) {
                        /* The circle is closer to the bounds on the x-axis */
                        closest_point.x = (closest_point.x > 0) ? aabb.half_width : -aabb.half_width;
                    } else {
                        /* Closer on the y-axis */
                        closest_point.y = (closest_point.y > 0) ? aabb.half_height : -aabb.half_height;
                    }
                }
                /*  */
                axis = dist.sub(closest_point);

                if (fast) {
                    return (axis.magsqrd() <= radius * radius) && !inside;
                }
                if (axis.magsqrd() > radius * radius) {
                    return new M.Vector();
                }

                if (inside) {
                    return axis.mul(-1);
                }
                return axis;
            },
            /**
             * Tests if the circle overlaps at any point with the polygon.
             *
             * This is just a special case of SAT whereby any projection of the circle onto an axis is a line whose
             *  length is the diameter of the circle, centered on the projection of its position
             *
             *
             * @param circle_position : Vector  - position of the circle
             * @param poly_position   : Vector  - position of the polygon
             * @param radius          : Number  - size of the circle
             * @param poly            : Polygon - Points that define the polygon
             * @param fast            : Bool    - Whether to return a boolean value or a collision manifold
             * @param reverse         : Bool    - Whether the polygon or the circle is the collider (defaults to false)
             */
            collideCirclePoly: function (circle_position, poly_position, radius, poly, fast, reverse) {
                var normals,
                    closestProjection,
                    scalar,
                    axis = circle_position.sub(poly_position),
                    closest_edge;

                closestProjection = _.max(_.map(poly.getPoints(), function (point) {
                    return point.scalarProject(axis);
                }));
                if (fast) {
                    return (axis.magsqrd() > 0 && Math.pow(closestProjection + radius, 2) > axis.magsqrd());
                }
                if (axis.magsqrd() <= 0 || Math.pow(closestProjection + radius, 2) <= axis.magsqrd()) {
                    return M.Vector();
                }
                scalar = closestProjection + radius - axis.mag();

                /* Clamp the axis projection to the normal faces of the polygon */
                normals = poly.getNormals();
                closest_edge = _.max(normals, function (normal) {
                    return axis.scalarProject(normal);
                });
                if (Math.abs(axis.sub(axis.vectorProject(closest_edge)).mag()) <= closest_edge.mag() / 2) {
                    // degrade the collision axis to the face's normal if the penetration vector is
                    //  perpendicular to the face
                    axis = closest_edge;
                }

                if (reverse) {
                    return axis.unt().mul(scalar);
                }
                return axis.unt().mul(-scalar);
            },
            /**
             * Axis-aligned Bounding Box Test
             *
             * Tests whether two AABBs are overlapping
             *
             * @param position1 : Vector  - position of the first AABB
             * @param position2 : Vector  - position of the second AABB
             * @param aabb1     : AABB    - data for the first AABB
             * @param aabb2     : AABB    - data for the second AABB
             * @param fast      : Boolean - whether to return a boolean or a collision manifold
             */
            collideAABBAABB: function (position1, position2, aabb1, aabb2, fast) {

                var offset = position1.sub(position2),
                    xmin = Math.max(offset.x - aabb1.half_width, -aabb2.half_width),
                    xmax = Math.min(offset.x + aabb1.half_width, aabb2.half_width),
                    ymin = Math.max(offset.y - aabb1.half_height, -aabb2.half_height),
                    ymax = Math.min(offset.y + aabb1.half_height, aabb2.half_height);
                if (fast) {
                    return (xmin < xmax && ymin < ymax);
                }

                if (xmin < xmax  && ymin < ymax) {
                    /* determine the shallowest penetration axis */
                    if (xmax - xmin < ymax - ymin) {
                        return new M.Vector({x: xmin - xmax});
                    }
                    return new M.Vector({y: ymin - ymax});
                }
                return new M.Vector();
            },
            /**
             * Separating Axis Test
             *
             * Tests whether or not there is an axis that completely separates two polygons.  Possible
             *  axis candidates are the normals of each polygon's faces.
             *
             * This test will terminate as soon as a separating axis is found, making it very fast for testing
             *  non-colliding entities
             *
             * @param position1 : Vector  - position of the first polygon
             * @param position2 : Vector  - position of the second polygon
             * @param poly1     : Polygon - vertex data for the first polygon
             * @param poly2     : Polygon - vertex data for the second polygon
             * @param fast      : Boolean - whether or not to return a boolean value, or a collision manifold
             */
            collideSAT: function (position1, position2, poly1, poly2, fast) {
                var mapProject = function (point) {
                        return point.scalarProject(this);
                    },
                    offset = position1.sub(position2),
                    normals = poly1.getNormals().concat(poly2.getNormals()),
                    i,
                    l = normals.length,
                    manifold = null,
                    projections1,
                    projections2,
                    min1,
                    max1,
                    min2,
                    max2,
                    penetration_depth;
                for (i = 0; i < l; i += 1) {
                    projections1 = _.map(poly1.getPoints(offset), mapProject, normals[i]);
                    projections2 = _.map(poly2.getPoints(), mapProject, normals[i]);
                    min1 = _.min(projections1);
                    max1 = _.max(projections1);
                    min2 = _.min(projections2);
                    max2 = _.max(projections2);

                    if (!M.rangeOverlaps(min1, max1, min2, max2)) {
                        return fast ? false : new M.Vector();
                    }
                    if (!fast) {
                        penetration_depth = Math.min(max1, max2) - Math.max(min1, min2);
                        if (!manifold || manifold.magsqrd() > Math.pow(penetration_depth, 2)) {
                            /* depending on the direction of the normal, we might have to flip the penetration direction */
                            penetration_depth = min1 < min2 ? -penetration_depth : penetration_depth;
                            manifold = normals[i].unt().mul(penetration_depth);
                        }
                    }
                }
                return fast ? true : manifold;
            },
            /**
             * Returns true if the given point is contained within the polygon
             *
             * Uses the ray casting algorithm to test whether a horizontal ray beginning at -Inf and
             *  ending at the point terminates inside the polygon by counting the number of intersections
             *  with the polygon's faces.  If there are an odd number of intersections, the point is inside the
             *  polygon; otherwise, the point is outside.
             *
             *
             * @param point         : Vector  - position of the point
             * @param poly_position : Vector  - position of the polygon
             * @param poly          : Polygon - defines the polygon's shape
             */
            pointInPoly: function (point, poly_position, poly) {
                var p = point.sub(poly_position),
                    poly_lines = poly.toLines(),
                    min_x = _.min(poly.getPoints(), function (point) {
                        return point.x;
                    }).x - 10,
                    ray = new M.Line({
                        start: new M.Vector({
                            x: min_x,
                            y: p.y
                        }),
                        end: new M.Vector({
                            x: p.x,
                            y: p.y
                        })
                    });

                return _.filter(poly_lines, function (line) {
                    return M.withinRange(line.int(ray).t, 0, 1);
                }).length % 2 === 1;

            }
        },
        componentMethods: {
            polyToAABB: function (polygon) {
                var points = polygon.getPoints(),
                    xmin = _.min(points, function (p) { return p.x; }).x,
                    xmax = _.max(points, function (p) { return p.x; }).x,
                    ymin = _.min(points, function (p) { return p.y; }).y,
                    ymax = _.max(points, function (p) { return p.y; }).y;

                return CF.createAABB(Math.max(-xmin, xmax), Math.max(-ymin, ymax));
            },

            /**
             * Returns a bounding circle approximation of the polygon
             * @param polygon : Polygon - point data
             */
            polyToCircle: function (polygon) {
                var points = polygon.getPoints(),
                /*
                 Find the point furthest from the origin, and use it as the radius
                 We use magsqrd() inside the comparator so we only have to perform a square root operation once at the end
                 */
                    radius = Math.sqrt(_.max(_.map(points, function (p) { return p.magsqrd(); })));
                return (CF.createBoundingCircle(radius));
            },
            /**
             * Returns a polygon version of the AABB
             * @param aabb : AABB - data for an AABB
             * @returns {*}
             */
            aabbToPoly: function (aabb) {
                return CF.createBoundingPolygon([
                    new M.Vector({
                        x: -aabb.half_width,
                        y: -aabb.half_height
                    }),
                    new M.Vector({
                        x: -aabb.half_width,
                        y: aabb.half_height
                    }),
                    new M.Vector({
                        x: aabb.half_width,
                        y: aabb.half_height
                    }),
                    new M.Vector({
                        x: aabb.half_width,
                        y: -aabb.half_height
                    })
                ]);
            }
        }
    };
});