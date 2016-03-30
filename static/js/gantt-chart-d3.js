
d3.gantt = function(elem) {
    if (typeof elem === 'undefined' || elem === null) {
        elem = 'body';
    }
    
    var FIT_TIME_DOMAIN_MODE = "fit";
    var FIXED_TIME_DOMAIN_MODE = "fixed";
    
    var word_width = 6.7;
    
    var padding = {
            top: 11,
            right: 10,
            bottom: 80,
            left: 5
    };
    var margin = {
            top : 40,
            right : 40,
            bottom : 20,
            left : 180
    };
    
    var data_book;
    var data_task;
    
    var timeRange = "semi";
    var todayOffset = false;
    
    var today = new Date();
    today.setHours(0);
    today.setMinutes(0);
    var today_range = [today];
    
    var tickNums = {week:7, month:30, semi:6, year:12};
    
    var timeDomainStart = d3.time.day.offset(new Date(),-3);
    var timeDomainEnd = d3.time.hour.offset(new Date(),+3);
    var timeDomainMode = FIXED_TIME_DOMAIN_MODE;// fixed or fit
    
    var startAlt;
    var endAlt;
    
    var y_sort = "firstname";
    var sortSpeed = 10;
    
    var colourBy = "project";
    
    var users = [];
    var usernames = [];
    var projects = [];
    
    var width = document.body.clientWidth;
    var height = document.body.clientHeight;
    
    var mini_height = 50;
    
    var inner_width = width - margin.right - margin.left;
    var inner_height = height - margin.top - margin.bottom - padding.bottom;
    
    var rowHeight = 150;
    var taskBar = {
            height: 12,
            padding: 2,
    };
    
    var tickFormat = "%H:%M";
    
    var getUser = function(username) {
        for (var i=0;i<users.length;i++) {
            if (users[i].name == username) return users[i];
        }
        return null;
    };
    
    var tooltipFormat = function(d, weekday) {
        /* check if dates are null (start.year=1970, end.year=2070)*/
        var year = d.getFullYear();
        if (year <= 1970 || year >= 2070)
            return '?';
        
        var starti = 0;
        if (typeof weekday === 'undefined' || weekday === null) {
            starti = 4;
        }
        var t = new Date();
        if (t.getFullYear() !== d.getFullYear()) {
            return d.toDateString().slice(starti);
        }
        return d.toDateString().slice(starti, -5);
    };
    
    var dateRangeFormat = function(sd, ed) {
        var result;
        var startyear = sd.getFullYear();
        var endyear = ed.getFullYear();
        if (startyear <= 1970 || endyear >= 2070) {
            var x = tooltipFormat(sd);
            var y = tooltipFormat(ed);
            if (x !== y)
                x += ' - ';
            result = x + y + ' (∞ days)';
        } else {
            var saturdays = d3.time.saturday.range(sd, ed).length;
            var sundays = d3.time.sunday.range(sd, ed).length;
            var workdays = d3.time.day.range(sd, ed).length - saturdays - sundays;
            result = tooltipFormat(sd)
            if (workdays > 1)
                result += " - " + tooltipFormat(ed) + " ("+workdays+" days)";
            else
                result += " (1 day)";
        }
        return result;
    };
    
    var tooltip = d3.select("body").append("div")
        .attr("class", "tooltip-booking")
        .style("position", "absolute")
        .style("z-index", "10")
        .style("visibility", "hidden");
    
    var tooltipTask = d3.select("body").append("div")
        .attr("class", "tooltip-task")
        .style("position", "absolute")
        .style("z-index", "10")
        .style("visibility", "hidden");
    
    var contextdiv = d3.select("body").append("div")
        .attr("id", "context-menu")
        .attr("class", "context-menu")
        .style("position", "absolute")
        .style("z-index", "20")
        .style("visibility", "hidden");
    
    d3.select("body").on("click", function() {
        d3.select("#context-menu").style("visibility", "hidden");
    });
    
    var contextInit = false;
    var context = null;
    var contextMenu = function(that, newContext) {
        if (context) {
            if (context !== newContext) {
                console.log("contextmenu already exists");
                return;
            }
        }
        var source = d3.select(that);
        var d = source.datum();
        context = newContext;
        d3.event.preventDefault();
        
        var cmenu = d3.select("#context-menu")
            .style("position", "absolute")
            .style("display", "inline-block");
        
        var links = [];
        d.items.forEach(function(s) {
            if (s.shotgunurl !== "") {
                links.push("<li><a href='http://"+s.shotgunurl+"' target='_shotgun'><span class='bold'>"+s.projectname+"</span> "+s.entityname+"</a></li>");
            }
        });
        var ccontent = "<div class='bold'>Shotgun Links</div><ul>"+links.join("")+"</ul>";
        cmenu.html(ccontent).style("top", (event.pageY-10)+"px").style("left",(event.pageX-20)+"px").style("visibility", "visible");
    };
    
    var x = d3.time.scale()
        .domain([timeDomainStart, timeDomainEnd])
        .range([0, inner_width])
        .clamp(true);
    
    var x2 = d3.time.scale()
        .domain([timeDomainStart, timeDomainEnd])
        .range([0, inner_width]);
    
    var y = d3.scale.ordinal()
        .domain(usernames)
        .rangeRoundBands([0, inner_height], .1);
    
    var y2 = d3.scale.ordinal()
        .domain(usernames)
        .range([0, mini_height]);
    
    var xAxisTop = d3.svg.axis()
        .scale(x)
        .orient("bottom")
        .tickFormat(d3.time.format(tickFormat))
        .tickSubdivide(true)
        .tickSize(0)
        .tickPadding(8);
    
    var xAxis = d3.svg.axis()
        .scale(x)
        .orient("bottom")
        .tickFormat(d3.time.format(tickFormat))
        .tickSubdivide(true)
        .tickSize(0)
        .tickPadding(8);
    
    var xAxis2 = d3.svg.axis()
        .scale(x2)
        .orient("bottom")
        .tickFormat(d3.time.format(tickFormat))
        .tickSubdivide(true)
        .tickSize(0)
        .tickPadding(8);
    
    var yAxis = d3.svg.axis()
        .scale(y)
        .orient("left")
        .tickSize(-width,0,0);
    
    var brush = d3.svg.brush()
        .x(x2)
        .on("brush", brushed);
    
    var keyFunction = function(d) {
        return d.sgid;
    };
    var weekendKeyFn = function (d) {
        return d;
    };
    
    var bookingTransform = function(d) {
        var bar_height = y.rangeBand() / +d.stack;
        var y_offset = y(d.username) + (bar_height * d.z);
        return "translate(" + x(new Date(d.start_date)) + "," + y_offset + ")";
    };
    
    var taskTransform = function(d) {
        var bar_height = y.rangeBand() / +d.stack;
        var y_offset = y(d.username) + ((taskBar.height+taskBar.padding) * d.z);
        return "translate(" + x(new Date(d.start_date)) + "," + y_offset + ")";
    };
    
    function daysToPixels(offset, d) {
        /* returns width of x-axis (tick to tick) */
        if (typeof d === 'undefined' || d === null)
            var d = new Date();
        if (timeRange === "week" || timeRange === "month") {
            return x(d3.time.day.offset(d, offset)) - x(d);
        } else {
            return x(d3.time.month.offset(d, offset)) - x(d);
        }
    }
    
    var weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var month_names = ["January", "February", "March", "April", "May", "June",
                       "July", "August", "September", "October", "November", "December"];
    function adjustTickText(sel) {
        /* center x-axis labels */
        var ticktexts = sel.selectAll('text');
        var num = ticktexts[0].length - 1;
        
        var last_tick;
        switch(timeRange) {
            case 'week':
                last_tick = weekdays[timeDomainEnd.getDay()] + ' ' + ('00' + timeDomainEnd.getDate()).slice(-2);
                break;
            case 'month':
                //last_tick = ('00' + timeDomainEnd.getDate()).slice(-2);
                last_tick = weekdays[timeDomainEnd.getDay()] + ' ' + ('00' + timeDomainEnd.getDate()).slice(-2);
                break;
            case 'semi':
                last_tick = month_names[timeDomainEnd.getMonth()];
                
                break;
            case 'year':
                last_tick = month_names[timeDomainEnd.getMonth()];
                break;
        }
        
        ticktexts.each(function(d, i) {
            var tick = d3.select(this);
            if ((tick.text() === last_tick) && (x(d) > 0)) {
                tick.attr('visibility', 'hidden');
            } else {
                tick.attr({
                    transform: 'translate(' + daysToPixels(1, d) / 2 + ',0)',
                    visibility: 'visible',
                    });
            }
        });
    }
    function adjustTickText2(sel) {
        /* center x-axis labels */
        var ticktexts = sel.selectAll('text');
        var num = ticktexts[0].length - 1;
        var last_tick = month_names[timeDomainEnd.getMonth()];
        ticktexts.each(function(d, i) {
            var tick = d3.select(this);
            if ((tick.text() === last_tick) && (x(d) > 0)) {
                tick.attr('visibility', 'hidden');
            } else {
                tick.attr({
                    transform: 'translate(' + (x2(d3.time.month.offset(d, 1)) - x2(d)) / 2 + ',0)',
                    visibility: 'visible',
                    });
            }
        });
    }
    
    function getDateRange() {
        var date_range = timeRange;
        var today_offset = todayOffset;
        var begin = startAlt;
        var finish = endAlt;
        
        var daylen = 24 * 60 * 60 * 1000;
        var d = new Date();
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0);
        
        if (typeof begin !== 'undefined' || begin != null) {
            var begin_date = begin;
        } else {
            var begin_date = null;
        }
        if (typeof finish !== 'undefined' || finish != null) {
            var finish_date = finish;
        } else {
            var finish_date = null;
        }
        
        var start_date = new Date();
        var end_date = new Date();
        
        switch (date_range) {
            case "week":
                if (today_offset) {
                    start_date.setTime(d.getTime() - daylen);
                } else {
                    if (begin_date === null) {
                        start_date.setTime(d.getTime() - ((d.getDay() ? d.getDay() : 7) - 1) * daylen);
                    } else {
                        start_date = begin_date;
                    }
                }
                end_date = new Date(new Date().setTime(start_date.getTime() + (7 * daylen)));
                format = '%a %d';
                subdivide = true;
                break;
            case "month":
                if (today_offset) {
                    start_date.setTime(d.getTime() - (1 * daylen));
                    end_date.setTime(start_date.getTime() + (31 * daylen));
                } else {
                    if (begin_date === null) {
                        start_date = new Date(d.getFullYear(), d.getMonth(), 1);
                        end_date = new Date(d.getFullYear(), d.getMonth()+1, 1);
                    } else {
                        start_date = begin_date;
                        end_date = new Date(start_date.getFullYear(), start_date.getMonth()+1, 1);
                    }
                }
                format = '%a %d';
                subdivide = true;
                break;
            case "semi":
                if (today_offset) {
                    start_date.setTime(d.getTime() - (7 * daylen));
                    var eyear = start_date.getFullYear();
                    var emonth = start_date.getMonth()+6;
                    if (emonth > 12) {
                        eyear++;
                        emonth -= 12;
                    }
                    end_date = new Date(eyear, emonth, start_date.getDate());
                } else {
                    if (begin_date === null) {
                        if (d.getMonth() < 6) {
                            start_date = new Date(d.getFullYear(), 0, 1);
                            end_date = new Date(d.getFullYear(), 6, 1);
                        } else {
                            start_date = new Date(d.getFullYear(), 6, 1);
                            end_date = new Date(d.getFullYear()+1, 0, 1);
                        }
                    } else {
                        start_date = begin_date;
                        if (start_date.getMonth() < 6) {
                            end_date = new Date(start_date.getFullYear(), start_date.getMonth()+6, 1);
                        } else {
                            end_date = new Date(start_date.getFullYear()+1, start_date.getMonth()-6, 1);
                        }
                    }
                }
                format = '%B';
                subdivide = true;
                ticks = 6;
                break;
            case "year":
                if (today_offset) {
                    start_date.setTime(d.getTime() - (30 * daylen));
                    var emonth = start_date.getMonth();
                    var eday = start_date.getDate();
                    if (emonth === 1 && eday > 28) eday = 28;
                    end_date = new Date(start_date.getFullYear()+1, emonth, eday);
                } else {
                    if (finish_date === null) {
                        start_date = new Date(d.getFullYear(), 0, 1);
                        end_date = new Date(d.getFullYear()+1, 0, 1);
                    } else {
                        start_date = new Date(finish_date.getFullYear(), finish_date.getMonth(), 1);
                        end_date = new Date(finish_date.getFullYear()+1, finish_date.getMonth(), 1);
                    }
                }
                format = '%B';
                subdivide = true;
                break;
            default:
                start_date.setTime(d.getTime() - ((d.getDay() ? d.getDay() : 7) - 1) * daylen);
                end_date.setTime(start_date.getTime() + 6 * daylen);
                format = '%a %d';
                subdivide = false;
                break;
        }
        ticks = tickNums[date_range];
        
        var g = {start:start_date, end:end_date, ticks:ticks,
                tickformat:format, ticksubdivide:subdivide
                };
        return g;
    }
    
    function wrap(text, width) {
        text.each(function() {
          var text = d3.select(this),
              words = text.text().split(/\s+/).reverse(),
              word,
              line = [],
              lineNumber = 0,
              lineHeight = 1.1, // ems
              y = text.attr("y"),
              dy = parseFloat(text.attr("dy")),
              tspan = text.text(null).append("tspan").attr("x", -3).attr("y", y).attr("dy", dy + "em");
          
          while (word = words.pop()) {
            line.push(word);
            tspan.text(line.join(" "));
            if (tspan.node().getComputedTextLength() > width) {
              line.pop();
              tspan.text(line.join(" "));
              line = [word];
              tspan = text.append("tspan").attr("x", -3).attr("y", y).attr("dy", ++lineNumber * lineHeight + dy + "em").text(word);
            }
          }
        });
    }
    
    var initDims = function() {
        width = document.body.clientWidth;
        // caculate height by number of users
        height = users.length * rowHeight;
        inner_width = width - margin.right - margin.left;
        inner_height = height - margin.top - margin.bottom - padding.bottom;
    }
    
    var initAxis = function() {
        var time_range = getDateRange();
        timeDomainStart = time_range.start;
        timeDomainEnd = time_range.end;
        
        x = d3.time.scale()
            .domain([timeDomainStart, timeDomainEnd])
            .range([0, inner_width])
            .clamp(true);
        
        xAxisTop = d3.svg.axis()
            .scale(x)
            .orient("top")
            .ticks(time_range.ticks)
            .tickFormat(d3.time.format(time_range.tickformat))
            .tickSubdivide(time_range.ticksubdivide)
            .tickSize(-inner_height)
            .tickPadding(8);
        
        xAxis = d3.svg.axis()
            .scale(x)
            .orient("bottom")
            .ticks(time_range.ticks)
            .tickFormat(d3.time.format(time_range.tickformat))
            .tickSubdivide(time_range.ticksubdivide)
            .tickSize(0)
            .tickPadding(8);
        
        x2 = d3.time.scale()
            .domain([timeDomainStart, timeDomainEnd])
            .range([0, inner_width])
            .clamp(true);
        
        xAxis2 = d3.svg.axis()
            .scale(x2)
            .orient("bottom")
            .ticks(time_range.ticks)
            .tickFormat(d3.time.format(time_range.tickformat))
            .tickSubdivide(time_range.ticksubdivide)
            .tickSize(0)
            .tickPadding(8);
        
        brush = d3.svg.brush()
            .x(x2)
            .on("brush", brushed)
            .on("brushend", brushend);
    };
    
    
    /*
     * 
     * Gantt draw
     * 
     */
    function gantt(databook, datatask) {
        
        data_book = databook;
        data_task = datatask;
        
        initDims();
        initAxis();
        
        // sort Y-axis
        var sortby;
        switch (y_sort) {
            case "firstname":
                sortby = function(a, b) { return d3.ascending(a.name, b.name); };
                break;
            case "lastname":
                sortby = function(a, b) {
                    alastname = a.name.split(' ')[1];
                    blastname = b.name.split(' ')[1];
                    return d3.ascending(alastname, blastname);
                };
                break;
            case "department":
                sortby = function(a, b) { return d3.ascending(a.department.code, b.department.code); }
                break;
            default:
                sortby = function(a, b) { return d3.ascending(a.name, b.name); };
                break;
        }
        
        // setup Y-axis
        y = d3.scale.ordinal()
            .domain(users.sort(sortby).map(function(d) { return d.name; }))
            .rangeRoundBands([0, inner_height], .1);
        
        yAxis = d3.svg.axis()
            .scale(y)
            .orient("left")
            .tickSize(-inner_width-margin.left, 0);
        
        y2 = d3.scale.ordinal()
            .domain(users.sort(sortby).map(function(d) { return d.name; }))
            .rangeRoundBands([0, mini_height], .1);
        
        // mini
        var minisvg = d3.select("#mini")
            .append("svg")
                .attr("class", "mini-chart")
                .attr("width", "100%")
                .attr("height", mini_height + 30);
        
        var context = minisvg.append("g")
            .attr("class", "context")
            .attr("width", inner_width)
            .attr("transform", "translate(" + 180 + "," + 10 + ")");
        
        context.append("g").attr("width", inner_width).selectAll("miniItems")
            .data(databook)
            .enter()
            .append("g")
              .attr("class", function(d) { return "project-"+d.projectcode; })
              .attr("x", function(d) { return x2(new Date(d.start_date)); })
              .attr("transform", function(d) {
                  var bar_height = y2.rangeBand() / +d.stack;
                  var y_offset = y2(d.username) + (bar_height * d.z);
                  return "translate(" + x(new Date(d.start_date)) + "," + y_offset + ")";
              })
            .append("rect")
              .attr("width", function(d) {
                  var w = Math.floor(x2(new Date(d.end_date)) - x2(new Date(d.start_date)));
                  if (w < 0 || isNaN(w))
                      return 0;
                  return w === 0 ? 1:w;
              })
              .attr("height", 1);
        
        context.append("g")
            .attr("class", "x2 axis")
            .attr("transform", "translate(0," + mini_height + ")")
            .call(xAxis2)
            .call(adjustTickText2);
        
        context.append("g")
            .attr("class", "brush")
            .call(brush)
          .selectAll("rect")
            .attr("y", -6)
            .attr("height", mini_height + 7);
        
        
        // start building chart
        var svg = d3.select(elem)
            .append("svg")
              .attr("class", "chart")
              .attr("width", "100%")
              .attr("height", height + padding.bottom);
        
        var gantt_chart = svg.append("g")
              .attr("class", "gantt-chart")
              .attr("width", inner_width)
              .attr("height", inner_height)
              .attr("transform", "translate(" + margin.left + ", " + margin.top + ")");
        
        var ganttChartSelect = gantt_chart.selectAll('.gantt-chart');
        
        // weekends
        var weekends = ganttChartSelect.data(d3.time.saturday.range(timeDomainStart, timeDomainEnd), weekendKeyFn)
            .enter()
            .append("g")
            .attr("class", "weekends")
            .attr("transform", function(d) { return "translate("+x(d)+",0)"; });
        
        weekends.append("rect")
            .attr("class", "weekend")
            .attr("y", 0)
            .attr("height", inner_height)
            .attr("x", 0)
            .attr("width", function(d) {
                return x(d3.time.day.offset(d, 2)) - x(d);
            });
        
        // lightblue
        var todayMark = ganttChartSelect.data(today_range, function(d) {d.getSeconds()})
            .enter()
            .append("rect")
            .attr("class", "today")
            .attr("height", inner_height)
            .attr("width", function(d) {
                return x(d3.time.day.offset(d,1)) - x(d);
            })
            .attr("transform", function(d) { return "translate("+x(d)+",0)"; });
        
        // top label
        var time_label;
        switch (timeRange) {
            case "week":
                time_label = d3.time.format("Week %U / %B")(timeDomainStart);
                break;
            case "month":
                time_label = d3.time.format("%B %Y")(timeDomainStart);
                break;
            case "semi":
                var m = timeDomainStart.getMonth();
                if (m < 6) {
                    time_label = d3.time.format("Half 1 / %Y")(timeDomainStart);
                } else {
                    time_label = d3.time.format("Half 2 / %Y")(timeDomainStart);
                }
                break;
            case "year":
                time_label = d3.time.format("%Y")(timeDomainStart);
                break;
            default:
                time_label = d3.time.format("%Y")(timeDomainStart);
                break;
        }
        
        gantt_chart.append("text")
            .attr("class", "time-label")
            .attr("transform", "translate(" + (inner_width/2) + "," + (-30) + ")")
            .style("text-anchor", "middle")
            .text(time_label);
        
        // top x-axis
        gantt_chart.append("g")
            .attr("class", "axis x-axis-top")
            .call(xAxisTop)
            .call(adjustTickText);
        
        gantt_chart.append("g")
            .attr("class", "axis x-axis")
            .attr("transform", "translate(0, " + (inner_height) + ")")
            .call(xAxis)
            .call(adjustTickText);
        
        gantt_chart.append("g")
            .attr("class", "axis y-axis")
            .call(yAxis)
            .selectAll("text")
            .call(wrap, 86);
        
        // add thumbnail, department code to Y-axis
        var yticklines = gantt_chart.selectAll(".y-axis line");
        yticklines.each(function(d) {
            var h = 60;
            var w = h * 1.5;
            
            var u = getUser(d);
            if (u !== null) {
                var p = d3.select(this.parentNode);
                p.append("text")
                 .attr("class", "dept-code dept-"+u.department.code)
                 .attr("transform", "translate("+(-u.department.code.length*9.5)+","+ (-11)+")")
                 .text(u.department.code);
                
                p.append('image')
                 .attr('xlink:href', u.image)
                 .attr("width", w)
                 .attr("height", h)
                 .attr("transform", "translate("+(-margin.left)+","+ (-30)+")");
            }
            
            d3.select(this).attr("transform", "translate("+-margin.left+","+ Math.floor((rowHeight-10)/2) +")");
        });
        
        var bars = ganttChartSelect.data(databook, keyFunction)
            .enter()
            .append("g")
            .attr("class", function(d) {
                if (colourBy === 'project')
                    return "booking project-" + d.projectcode;
                else
                    return "booking dept-" + d.deptcode;
            })
            .attr("data-proj", function(d) {
                return d.projectcode;
            })
            .attr("data-dept", function(d) {
                return d.deptcode;
            })
            .attr("transform", bookingTransform);
        
        bars.append("rect")
            .attr("rx", 1)
            .attr("ry", 1)
            .attr("class", "book")
            .attr("height", function(d) {
                var h = y.rangeBand() / +d.stack;
                if (isNaN(h))
                    return 1;
                return h;
            })
            .attr("width", function(d) {
                var w = Math.floor(x(new Date(d.end_date)) - x(new Date(d.start_date)));
                if (w < 0 || isNaN(w))
                    return 1;
                return w === 0 ? 1:w;
            })
            .on("mouseover", function(d){
                var drange = dateRangeFormat(new Date(d.start_date), new Date(d.end_date));
                var content = "<span class='bold'>"+d.name+"</span>"+"<div>"+
                    drange+"</div><div>Created by "+d.created_by.name+" ("+
                    tooltipFormat(new Date(d.created_at))+")</div><div>Updated by "+
                    d.updated_by.name+" ("+tooltipFormat(new Date(d.updated_at))+")</div>";
                return tooltip.html(content).style("visibility", "visible");
            })
            .on("mousemove", function(d){return tooltip.style("top", (event.pageY-10)+"px").style("left",(event.pageX+10)+"px");})
            .on("mouseout", function(){return tooltip.style("visibility", "hidden");})
            .on("click", function(d) {
                console.log(d);
            });
        
        bars.append("text")
            .attr("class", "bar-label")
            .text(function(d) {
                return d.name;
            })
            .attr("x", function(d) { return padding.left; })
            .attr("y", function(d) {
                return (y.rangeBand() / +d.stack) / 2;
            })
            .style("font-size", function(d) {
                /*
                 * maximum font-size == h
                 */
                var w = Math.floor(x(new Date(d.end_date)) - x(new Date(d.start_date)));
                if (isNaN(w)) w = 1;
                var h = y.rangeBand() / +d.stack;
                if (isNaN(h)) h = 1;
                var n = d.name.length;
                var f = Math.floor(Math.min( h, (w/(n/2)) ));
                return f + "px";
            })
            .attr("dy", ".3em");
        
        var tasks = ganttChartSelect.data(datatask, keyFunction)
            .enter()
            .append("g")
            .attr("class", "tasks")
            .attr("transform", taskTransform);
        
        tasks.append("rect")
            .attr("class", "task")
            .attr("transform", function(d) {
            })
            .attr("height", function(d) {
                return taskBar.height;
            })
            .attr("width", function(d) {
                var w = Math.floor(x(new Date(d.end_date)) - x(new Date(d.start_date)));
                if (w < 0 || isNaN(w))
                    return 1;
                return w === 0 ? 1:w;
            })
            .on("mouseover", function(d){
                if (d == null) return "";
                var content = "<div class='bold'>"+d.projectname.toUpperCase()+"</div>";
                var taskitems = d.items;
                var tcontent = "";
                taskitems.forEach(function(x) {
                    tcontent += "<div>"+x.entityname+" ["+x.name+"] "+dateRangeFormat(new Date(x.start_date),new Date(x.end_date))+"</div>";
                });
                content += tcontent;
                return tooltipTask.html(content).style("visibility", "visible");
                
            })
            .on("mousemove", function(d){return tooltipTask.style("top", (event.pageY-10)+"px").style("left",(event.pageX+10)+"px");})
            .on("mouseout", function(){return tooltipTask.style("visibility", "hidden");})
            .on("click", function(d) {
                console.log(d);
            })
            .on("contextmenu", function(d, index) {
                d3.event.preventDefault();
                contextMenu(this, "context-task", d);
            });
       
       return gantt;
    };
    
    
    
    
    
    
    
    
    /* functions */
    
    /* change brush extent */
    gantt.brushExtent = function(range) {
        //if (!d3.event.sourceEvent) return;
        var daylen = 24 * 60 * 60 * 1000;
        var extent = brush.extent();
        switch (range) {
            case "week":
                var end_date = new Date(new Date().setTime(extent[0].getTime() + (8 * daylen)));
                extent[1] = d3.time.week.floor(end_date);
                //xAxisTop.ticks(d3.time.days, 7);
                break;
            case "month":
                var end_date = new Date();
                end_date.setTime(extent[0].getTime() + (31 * daylen));
                extent[1] = d3.time.month.floor(end_date);
                //xAxisTop.ticks(d3.time.days, 30);
                break;
            case "semi":
                var end_date = new Date();
                end_date.setTime(extent[0].getTime() + (31 * daylen * 6));
                extent[1] = d3.time.month.floor(end_date);
                //xAxisTop.ticks(d3.time.months, 6);
                break;
            case "year":
                d3.select('.brush').call(brush.clear()).call(brush);
                xAxisTop.ticks(d3.time.months, 12);
                brushed();
                return;
                break;
            default:
                break; 
        }
        d3.select('.brush').transition().call(brush.extent(extent));
        brushed();
    };
    
    
    /* Brushed */
    function brushend() {
        /*
        if (!d3.event.sourceEvent) return;
        
        var extent0 = brush.extent();
        var extent1 = extent0.map(d3.time.week.round);
        
        if (extent1[0] >= extent1[1]) {
            extent1[0] = d3.time.week.floor(extent0[0]);
            extent1[1] = d3.time.week.floor(extent0[1]);
        }
        
        d3.select(this).transition()
            .call(brush.extent(extent1));//.call(brush.event);
        */
    }
    
    function brushed() {
        var b = brush.empty() ? x2.domain() : brush.extent();
        var selection = b[1] - b[0];
        var weekms = 604800000;
        
        if (selection < weekms) {
            // brush selection is smaller than 1 week
            var extent0 = brush.extent();
            var extent1 = extent0.map(d3.time.week.round);
            if (extent1[0] >= extent1[1]) {
                extent1[0] = d3.time.week.floor(extent0[0]);
                extent1[1] = d3.time.week.floor(extent0[1]);
            }
            try {
                d3.select(this).transition()
                    .call(brush.extent(extent1));//.call(brush.event);
            } catch (err) {
                d3.select('brush').transition()
                    .call(brush.extent(extent1));//.call(brush.event);
            }
            b = brush.extent();
        }
        
        timeDomainStart = b[0];
        timeDomainEnd = b[1];
        
        x.domain([timeDomainStart, timeDomainEnd]).range([0, inner_width]);
        
        xAxisTop = d3.svg.axis()
            .scale(x)
            .orient("top")
            .tickSize(-inner_height)
            .tickSubdivide(true)
            .tickPadding(8);
        
        xAxis = d3.svg.axis()
            .scale(x)
            .orient("bottom")
            .tickSize(0)
            .tickSubdivide(true)
            .tickPadding(8);
        
        yAxis = d3.svg.axis()
            .scale(y)
            .orient("left")
            .tickSize(-inner_width-margin.left, 0);
        
        var databook = data_book.filter(function(d) {
            return new Date(d.start_date) < timeDomainEnd && new Date(d.end_date) > timeDomainStart;
        });
        var datatask = data_task.filter(function(d) {
            return new Date(d.start_date) < timeDomainEnd && new Date(d.end_date) > timeDomainStart;
        });
        
        var svg = d3.select(".chart");
        
        var time_label;
        switch (timeRange) {
            case "week":
                time_label = d3.time.format("Week %U / %B")(timeDomainStart);
                break;
            case "month":
                time_label = d3.time.format("%B %Y")(timeDomainStart);
                break;
            case "semi":
                var m = timeDomainStart.getMonth();
                if (m < 6) {
                    time_label = d3.time.format("Half 1 / %Y")(timeDomainStart);
                } else {
                    time_label = d3.time.format("Half 2 / %Y")(timeDomainStart);
                }
                break;
            case "year":
                time_label = d3.time.format("%Y")(timeDomainStart);
                break;
            default:
                time_label = d3.time.format("%Y")(timeDomainStart);
                break;
        }
        
        
        svg.select(".time-label")
           .text(time_label)
           .transition()
           .attr("transform", "translate(" + (inner_width/2) + "," + (-30) + ")");
        
        svg.select(".x-axis-top")
           .transition()
           .call(xAxisTop);
           //.call(adjustTickText);
        
        svg.select(".x-axis")
           .transition()
           .attr("transform", "translate(0, " + (inner_height) + ")")
           .call(xAxis);
           //.call(adjustTickText);
        
        svg.select(".y-axis")
           .transition()
           .call(yAxis)
           .selectAll("text")
           .call(wrap, 86);
        
        var ganttChartSelect = svg.select(".gantt-chart").attr("width", inner_width).attr("height", inner_height);
        
        var weekends = ganttChartSelect.selectAll(".weekends")
                                 .data(d3.time.saturday.range(timeDomainStart, timeDomainEnd), weekendKeyFn);
        
        var weekendsExit = d3.transition(weekends.exit())
            .attr('transform', function(d) { return 'translate('+d.x0+inner_width+',0)'; })
            .style("fill-opacity", 0)
            .remove();
        weekendsExit.select("rect")
            .attr('width', function() {
                var d = new Date();
                return x(d3.time.day.offset(d, 2)) - x(d);
            });
        
        var weekendsEnter = weekends.enter()
            .insert("g", ":first-child") // first to be drawn on svg
            .attr('class', 'weekends')
            .attr('transform', function(d) { return 'translate('+x(d)+',0)'; });
        
        weekendsEnter.append("rect")
            .attr('class', 'weekend newwknd')
            .attr('y', 0)
            .attr('x', 0)
            .attr('height', inner_height)
            .attr('width', function(d) {
                return x(d3.time.day.offset(d, 2)) - x(d);
            });
        
        var weekendsUpdate = d3.transition(weekends)
            .attr('transform', function(d) { return 'translate('+x(d)+',0)'; });
        
        weekendsUpdate.select("rect")
            .attr('height', inner_height)
            .attr('width', function(d) {
                return x(d3.time.day.offset(d, 2)) - x(d);
            });
        
        var todayMark = ganttChartSelect.selectAll(".today").data(today_range, function(d) {d.getSeconds()});
        todayMark.exit().remove();
        todayMark
            .transition()
            .attr("height", inner_height)
            .attr("width", function() {
                var d = new Date();
                return x(d3.time.day.offset(d, 1)) - x(d);
            })
            .attr("transform", function(d) { return "translate("+x(d)+",0)"; });
        
        
        /* Update Booking bars */
        var booking = ganttChartSelect.selectAll(".booking").data(databook, keyFunction);
        
        /* remove unbound elements */
        var bookingExit = d3.transition(booking.exit())
            .attr("transform", function(d) { return "translate(0," + (d.y0 + inner_height) + ")";})
            .style("fill-opacity", 0)
            .remove();
        bookingExit.select("rect")
            .attr("width", function(d) {
                return 1;
            });
        
        /* enter new elements */
        var bookingEnter = booking.enter()
            .append("g")
            .attr("class", "booking")
            .attr("class", function(d) {
                if (colourBy === 'project')
                    return "booking project-" + d.projectcode;
                else
                    return "booking dept-" + d.deptcode;
            })
            .attr("data-proj", function(d) {
                return d.projectcode;
            })
            .attr("data-dept", function(d) {
                return d.deptcode;
            })
            .attr("transform", bookingTransform);
        
        bookingEnter.insert("rect", ":first-child")
            .attr("class", "book")
            .attr("height", function(d) {
                var h = y.rangeBand() / +d.stack;
                if (isNaN(h))
                    return 1;
                return h
            })
            .attr("width", function(d) {
                var w = Math.floor(x(new Date(d.end_date)) - x(new Date(d.start_date)));
                if (w < 0 || isNaN(w))
                    return 1;
                return w === 0 ? 1:w;
            })
            .on("mouseover", function(d){
                var drange = dateRangeFormat(new Date(d.start_date), new Date(d.end_date));
                var content = "<span class='bold'>"+d.name+"</span>"+"<div>"+
                    drange+"</div><div>Created by "+d.created_by.name+" ("+
                    tooltipFormat(new Date(d.created_at))+")</div><div>Updated by "+
                    d.updated_by.name+" ("+tooltipFormat(new Date(d.updated_at))+")</div>";
                return tooltip.html(content).style("visibility", "visible");
            })
            .on("mousemove", function(d){return tooltip.style("top", (event.pageY-10)+"px").style("left",(event.pageX+10)+"px");})
            .on("mouseout", function(){return tooltip.style("visibility", "hidden");})
            .on("click", function(d) {
                console.log(d);
            });
        
        bookingEnter.append("text")
            .attr("class", "bar-label")
            .attr("x", function(d) { return padding.left; })
            .attr("y", function(d) {
                return (y.rangeBand() / +d.stack) / 2;
            })
            .text(function(d) { return d.name;});
        
        /* update elements */
        var bookingUpdate = d3.transition(booking)
                              .attr("transform", bookingTransform);
        
        bookingUpdate.select(".book")
            .attr("height", function(d) {
                var h = y.rangeBand() / +d.stack;
                if (isNaN(h))
                    return 1;
                return h;
            })
            .attr("width", function(d) {
                var w = (x(new Date(d.end_date)) - x(new Date(d.start_date)));
                if (w < 0 || isNaN(w))
                    return 1;
                return w === 0 ? 1:w;
            });
        
        bookingUpdate.select(".bar-label")
            .attr("y", function(d) {
                return (y.rangeBand() / +d.stack) / 2;
            })
            .style("font-size", function(d) {
                var w = Math.floor(x(new Date(d.end_date)) - x(new Date(d.start_date)));
                if (isNaN(w)) w = 1;
                var h = y.rangeBand() / +d.stack;
                if (isNaN(h)) h = 1;
                var n = d.name.length;
                var f = Math.floor(Math.min( h, (w/(n/2)) ));
                return f + "px";
            })
            .attr("dy", ".3em");
        
        var task = ganttChartSelect.selectAll(".tasks").data(datatask, keyFunction);
        
        var taskExit = d3.transition(task.exit())
            .attr("transform", function(d) { return "translate(0," + (d.y0 + inner_height) + ")";})
            .style("fill-opacity", 0)
            .remove();
        
        taskExit.select("rect")
            .attr("width", function(d) {
                return 1;
            });
        
        var taskEnter = task.enter()
            .append("g")
            .attr("class", "tasks")
            .attr("transform", taskTransform);
        
        taskEnter.append("rect")
            .attr("class", "task")
            .attr("height", function(d) {
                return taskBar.height;
            })
            .attr("width", function(d) {
                var w = Math.floor(x(new Date(d.end_date)) - x(new Date(d.start_date)));
                if (w < 0 || isNaN(w))
                    return 1;
                return w === 0 ? 1:w;
            })
            .on("mouseover", function(d){
                if (d == null) return "";
                var content = "<div class='bold'>"+d.projectname.toUpperCase()+"</div>";
                var taskitems = d.items;
                var tcontent = "";
                taskitems.forEach(function(x) {
                    tcontent += "<div>"+x.entityname+" ["+x.name+"] "+dateRangeFormat(new Date(x.start_date),new Date(x.end_date))+"</div>";
                });
                content += tcontent;
                return tooltipTask.html(content).style("visibility", "visible");
            })
            .on("mousemove", function(d){return tooltipTask.style("top", (event.pageY-10)+"px").style("left",(event.pageX+10)+"px");})
            .on("mouseout", function(){return tooltipTask.style("visibility", "hidden");})
            .on("click", function(d) {
                console.log(d);
            })
            .on("contextmenu", function(d, index) {
                d3.event.preventDefault();
                contextMenu(this, "context-task", d);
            });
            
            var taskUpdate = d3.transition(task).attr("transform", taskTransform);
            
            taskUpdate.select(".task")
                .attr("height", function(d) {
                    return taskBar.height;
                })
                .attr("width", function(d) {
                    var w = Math.floor(x(new Date(d.end_date)) - x(new Date(d.start_date)));
                    if (isNaN(w) || w < 0)
                        return 1;
                    return w === 0 ? 1:w;
                });
        
    };
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    /*
     *
     * REDRAW
     *
     */
    
    gantt.redraw = function() {
        initDims();
        /*
        x = d3.time.scale()
            .domain([timeDomainStart, timeDomainEnd])
            .range([0, inner_width])
            .clamp(true);
        
        xAxisTop = d3.svg.axis()
            .scale(x)
            .orient("top")
            .tickSubdivide(true)
            .tickSize(-inner_height)
            .tickPadding(8);
        
        xAxis = d3.svg.axis()
            .scale(x)
            .orient("bottom")
            .tickSubdivide(true)
            .tickSize(0)
            .tickPadding(8);
        
        x2 = d3.time.scale()
            .domain([timeDomainStart, timeDomainEnd])
            .range([0, inner_width])
            .clamp(true);
        
        xAxis2 = d3.svg.axis()
            .scale(x2)
            .orient("bottom")
            .tickSubdivide(true)
            .tickSize(0)
            .tickPadding(8);
        
        brush = d3.svg.brush().x(x2).on("brush", brushed);
        */
        brushed();
    };
    
    
    gantt.redraw1 = function(databook, datatask) {
        initDims();
        initAxis();
        
        yAxis = d3.svg.axis()
            .scale(y)
            .orient("left")
            .tickSize(-inner_width-margin.left, 0);
        
        var svg = d3.select(".chart");
        
        var time_label;
        switch (timeRange) {
            case "week":
                time_label = d3.time.format("Week %U / %B")(timeDomainStart);
                break;
            case "month":
                time_label = d3.time.format("%B %Y")(timeDomainStart);
                break;
            case "semi":
                var m = timeDomainStart.getMonth();
                if (m < 6) {
                    time_label = d3.time.format("Half 1 / %Y")(timeDomainStart);
                } else {
                    time_label = d3.time.format("Half 2 / %Y")(timeDomainStart);
                }
                break;
            case "year":
                time_label = d3.time.format("%Y")(timeDomainStart);
                break;
            default:
                time_label = d3.time.format("%Y")(timeDomainStart);
                break;
        }
        
        svg.select(".time-label")
           .text(time_label)
           .transition()
           .attr("transform", "translate(" + (inner_width/2) + "," + (-30) + ")");
        
        svg.select(".x-axis-top")
           .transition()
           .call(xAxisTop)
           .call(adjustTickText);
        
        svg.select(".x-axis")
           .transition()
           .attr("transform", "translate(0, " + (inner_height) + ")")
           .call(xAxis)
           .call(adjustTickText);
        
        svg.select(".y-axis")
           .transition()
           .call(yAxis)
           .selectAll("text")
           .call(wrap, 86);
        
        var ganttChartSelect = svg.select(".gantt-chart").attr("width", inner_width).attr("height", inner_height);
        
        var weekends = ganttChartSelect.selectAll(".weekends")
                                 .data(d3.time.saturday.range(timeDomainStart, timeDomainEnd), weekendKeyFn);
        
        var weekendsExit = d3.transition(weekends.exit())
            .attr('transform', function(d) { return 'translate('+d.x0+inner_width+',0)'; })
            .style("fill-opacity", 0)
            .remove();
        weekendsExit.select("rect")
            .attr('width', function() {
                var d = new Date();
                return x(d3.time.day.offset(d, 2)) - x(d);
            });
        
        var weekendsEnter = weekends.enter()
            .insert("g", ":first-child") // first to be drawn on svg
            .attr('class', 'weekends')
            .attr('transform', function(d) { return 'translate('+x(d)+',0)'; });
        
        weekendsEnter.append("rect")
            .attr('class', 'weekend newwknd')
            .attr('y', 0)
            .attr('x', 0)
            .attr('height', inner_height)
            .attr('width', function(d) {
                return x(d3.time.day.offset(d, 2)) - x(d);
            });
        
        var weekendsUpdate = d3.transition(weekends)
            .attr('transform', function(d) { return 'translate('+x(d)+',0)'; });
        
        weekendsUpdate.select("rect")
            .attr('height', inner_height)
            .attr('width', function(d) {
                return x(d3.time.day.offset(d, 2)) - x(d);
            });
        
        var todayMark = ganttChartSelect.selectAll(".today").data(today_range, function(d) {d.getSeconds()});
        todayMark.exit().remove();
        todayMark
            .transition()
            .attr("height", inner_height)
            .attr("width", function() {
                var d = new Date();
                return x(d3.time.day.offset(d, 1)) - x(d);
            })
            .attr("transform", function(d) { return "translate("+x(d)+",0)"; });
        
        
        /* Update Booking bars */
        var booking = ganttChartSelect.selectAll(".booking").data(databook, keyFunction);
        
        /* remove unbound elements */
        var bookingExit = d3.transition(booking.exit())
            .attr("transform", function(d) { return "translate(0," + (d.y0 + inner_height) + ")";})
            .style("fill-opacity", 0)
            .remove();
        bookingExit.select("rect")
            .attr("width", function(d) {
                return 1;
            });
        
        /* enter new elements */
        var bookingEnter = booking.enter()
            .append("g")
            .attr("class", "booking")
            .attr("class", function(d) {
                return "booking project-" + d.projectcode;
            })
            .attr("data-proj", function(d) {
                return d.projectcode;
            })
            .attr("data-dept", function(d) {
                return d.deptcode;
            })
            .attr("transform", bookingTransform);
        
        bookingEnter.insert("rect", ":first-child")
            .attr("class", "book")
            .attr("height", function(d) {
                var h = y.rangeBand() / +d.stack;
                if (isNaN(h))
                    return 1;
                return h
            })
            .attr("width", function(d) {
                var w = Math.floor(x(new Date(d.end_date)) - x(new Date(d.start_date)));
                if (w < 0 || isNaN(w))
                    return 1;
                return w === 0 ? 1:w;
            })
            .on("mouseover", function(d){
                var drange = dateRangeFormat(new Date(d.start_date), new Date(d.end_date));
                var content = "<span class='bold'>"+d.name+"</span>"+"<div>"+
                    drange+"</div><div>Created by "+d.created_by.name+" ("+
                    tooltipFormat(new Date(d.created_at))+")</div><div>Updated by "+
                    d.updated_by.name+" ("+tooltipFormat(new Date(d.updated_at))+")</div>";
                return tooltip.html(content).style("visibility", "visible");
            })
            .on("mousemove", function(d){return tooltip.style("top", (event.pageY-10)+"px").style("left",(event.pageX+10)+"px");})
            .on("mouseout", function(){return tooltip.style("visibility", "hidden");})
            .on("click", function(d) {
                console.log(d);
            });
        
        bookingEnter.append("text")
            .attr("class", "bar-label")
            .attr("x", function(d) { return padding.left; })
            .attr("y", function(d) {
                return (y.rangeBand() / +d.stack) / 2;
            })
            .text(function(d) { return d.name;});
        
        /* update elements */
        var bookingUpdate = d3.transition(booking)
                              .attr("transform", bookingTransform);
        
        bookingUpdate.select(".book")
            .attr("height", function(d) {
                var h = y.rangeBand() / +d.stack;
                if (isNaN(h))
                    return 1;
                return h;
            })
            .attr("width", function(d) {
                var w = (x(new Date(d.end_date)) - x(new Date(d.start_date)));
                if (w < 0 || isNaN(w))
                    return 1;
                return w === 0 ? 1:w;
            });
        
        bookingUpdate.select(".bar-label")
            .attr("y", function(d) {
                return (y.rangeBand() / +d.stack) / 2;
            })
            .style("font-size", function(d) {
                var w = Math.floor(x(new Date(d.end_date)) - x(new Date(d.start_date)));
                if (isNaN(w)) w = 1;
                var h = y.rangeBand() / +d.stack;
                if (isNaN(h)) h = 1;
                var n = d.name.length;
                var f = Math.floor(Math.min( h, (w/(n/2)) ));
                return f + "px";
            })
            .attr("dy", ".3em");
        
        var task = ganttChartSelect.selectAll(".tasks").data(datatask, keyFunction);
        
        var taskExit = d3.transition(task.exit())
            .attr("transform", function(d) { return "translate(0," + (d.y0 + inner_height) + ")";})
            .style("fill-opacity", 0)
            .remove();
        
        taskExit.select("rect")
            .attr("width", function(d) {
                return 1;
            });
        
        var taskEnter = task.enter()
            .append("g")
            .attr("class", "tasks")
            .attr("transform", taskTransform);
        
        taskEnter.append("rect")
            .attr("class", "task")
            .attr("height", function(d) {
                return taskBar.height;
            })
            .attr("width", function(d) {
                var w = Math.floor(x(new Date(d.end_date)) - x(new Date(d.start_date)));
                if (w < 0 || isNaN(w))
                    return 1;
                return w === 0 ? 1:w;
            })
            .on("mouseover", function(d){
                if (d == null) return "";
                var content = "<div class='bold'>"+d.projectname.toUpperCase()+"</div>";
                var taskitems = d.items;
                var tcontent = "";
                taskitems.forEach(function(x) {
                    tcontent += "<div>"+x.entityname+" ["+x.name+"] "+dateRangeFormat(new Date(x.start_date),new Date(x.end_date))+"</div>";
                });
                content += tcontent;
                return tooltipTask.html(content).style("visibility", "visible");
            })
            .on("mousemove", function(d){return tooltipTask.style("top", (event.pageY-10)+"px").style("left",(event.pageX+10)+"px");})
            .on("mouseout", function(){return tooltipTask.style("visibility", "hidden");})
            .on("click", function(d) {
                console.log(d);
            })
            .on("contextmenu", function(d, index) {
                d3.event.preventDefault();
                contextMenu(this, "context-task", d);
            });
            
            var taskUpdate = d3.transition(task).attr("transform", taskTransform);
            
            taskUpdate.select(".task")
                .attr("height", function(d) {
                    return taskBar.height;
                })
                .attr("width", function(d) {
                    var w = Math.floor(x(new Date(d.end_date)) - x(new Date(d.start_date)));
                    if (isNaN(w) || w < 0)
                        return 1;
                    return w === 0 ? 1:w;
                });
        
    }; // redraw
    
    
    gantt.sorter = function(by) {
        y_sort = by;
        var sortby;
        switch (y_sort) {
            case "firstname":
                sortby = function(a, b) { return d3.ascending(a.name, b.name); };
                break;
            case "lastname":
                sortby = function(a, b) {
                    alastname = a.name.split(' ')[1];
                    blastname = b.name.split(' ')[1];
                    return d3.ascending(alastname, blastname);
                };
                break;
            case "department":
                sortby = function(a, b) { return d3.ascending(a.department.code+a.name, b.department.code+b.name); }
                break;
            default:
                sortby = function(a, b) { return d3.ascending(a.name, b.name); };
                break;
        }
        var y0 = y.domain(users.sort(sortby)
                .map(function(d) { return d.name; }))
                .copy();
        
        var svg = d3.select(".chart")
        var transition = svg.transition().duration(200);
        var delay = function(d, i) {
            return i * (sortSpeed / users.length);
        };
        
        transition.selectAll('.booking')
            .delay(delay)
            .attr("transform", bookingTransform);
        
        transition.selectAll('.tasks')
            .delay(delay)
            .attr("transform", taskTransform);
        
        transition.select(".y-axis")
            .call(yAxis)
            .selectAll("g")
            .delay(delay);
        
        svg.select(".y-axis").selectAll("text").call(wrap, 86);
        
        return gantt;
    };
    
    gantt.cleanup = function() {
        d3.selectAll("svg").remove();
        return gantt;
    };
    
    gantt.margin = function(value) {
        if (!arguments.length)
            return margin;
        margin = value;
        return gantt;
    };
    
    gantt.timeDomain = function(value) {
        if (!arguments.length)
            return [timeDomainStart, timeDomainEnd];
        timeDomainStart = value[0];
        timeDomainEnd = value[1];
        return gantt;
    };
    
    /**
     * @param {string}
     *                vale The value can be "fit" - the domain fits the data or
     *                "fixed" - fixed domain.
     */
    
    gantt.ysort = function(value) {
        if (!arguments.length)
            return y_sort;
        y_sort = value;
        return gantt;
    };

    gantt.sortSpeed = function(value) {
        if (!arguments.length)
            return sortSpeed;
        sortSpeed = value;
        return gantt;
    };
    
    gantt.timeDomainMode = function(value) {
        if (!arguments.length)
            return timeDomainMode;
        timeDomainMode = value;
        return gantt;
    };
    
    gantt.users = function(value) {
        if (!arguments.length)
            return users;
        users = value;
        // update usernames
        usernames = [];
        for (var i=0;i<users.length;i++) {
            usernames.push(users[i].name);
        }
        usernames.sort();
        return gantt;
    };
    
    gantt.projects = function(value) {
        if (!arguments.length)
            return projects;
        projects = value;
        return gantt;
    };
    
    gantt.width = function(value) {
        if (!arguments.length)
            return width;
        width = +value;
        return gantt;
    };
    
    gantt.height = function(value) {
        if (!arguments.length)
            return height;
        height = +value;
        return gantt;
    };
    
    gantt.tickFormat = function(value) {
        if (!arguments.length)
            return tickFormat;
        tickFormat = value;
        return gantt;
    };
    
    gantt.timeRange = function(value) {
        if (!arguments.length)
            return timeRange;
        timeRange = value;
        
        var trange = getDateRange(timeRange, todayOffset);
        timeDomainStart = trange.start;
        timeDomainEnd = trange.end;
        startAlt = null;
        endAlt = null;
        return gantt;
    };
    
    gantt.dateAlter = function(value) {
        if (!arguments.length)
            return [startAlt, endAlt];
        startAlt = value[0];
        endAlt = value[1];
        return gantt;
    };
    
    gantt.rangeChange = function(value) {
        if (!arguments.length)
            return [timeRange, startAlt, endAlt];
        /*var trange = getDateRange(value[0], todayOffset, value[1], value[2]);
        timeDomainStart = trange.start;
        timeDomainEnd = trange.end;*/
        timeRange = value[0];
        startAlt = value[1];
        endAlt = value[2];
        return gantt;
    };
    
    gantt.todayOffset = function(value) {
        if (!arguments.length)
            return todayOffset;
        todayOffset = value;
        return gantt;
    };
    
    gantt.colour = function(value) {
        if (!arguments.length)
            return colourBy;
        colourBy = value;
        return gantt;
    };
    
    gantt.setData = function(value) {
        if (!arguments.length)
            return [data_book, data_task];
        data_book = value[0];
        data_task = value[1];
        return gantt;
    };
    
    return gantt;
};
