let debug_text = '';

// OPTIONS (GUI to-do)

const options = ['Show Key', 'Hover-Harmonies', 'Color', 'Chords'];
const bars = 3;
const width = 1000;
const height = 500;
const key = 'C';
const bpm = 40;
const preset_notes = false;


// BASIC SETUP / accessory functions

const synth = new Tone.PolySynth(Tone.Synth).toDestination();

// setting up the names of notes, associated colors etc.
const note_names = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const twelve_notes = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
const note_colors = {};
// https://personal.sron.nl/~pault/
// const colors  = ['#4477AA', '#66CCEE', '#228833', '#CCBB44', '#EE6677', '#AA3377', '#BBBBBB'];
const colors  = ['#e69f00', '#56b3e9', '#009e73', '#57571a', '#0072b2', '#d55c00', '#cc79a7'];
for (let i=0; i<7; i++) {
  note_colors[note_names[i]] = colors[i];
}
// Function to get note name from midi #
const get_note_name = (midi_num) => twelve_notes[(midi_num-21) % 12]; // A0 is at midi code 21
// Function that returns whether note is in the scale for a given key
const in_scale = (note_num, the_key) => {
  // Scales us so 0 is the root of the key
  const scaled_note_num = (note_num - twelve_notes.indexOf(the_key) - 21) % 12;
  return [0, 2, 4, 5, 7, 9, 11].indexOf(scaled_note_num) > -1; // true if in the scale
}
// For debugging - getting example notes, so we can quickly test display stuff
const get_example_notes = () => {
  let example_notes = [{'note': 65, 'start': 0, 'noteLen': 16},
  {'note': 69, 'start': 0, 'noteLen': 16},
  {'note': 72, 'start': 0, 'noteLen': 16},
  {'note': 64, 'start': 16, 'noteLen': 16},
  {'note': 67, 'start': 16, 'noteLen': 16},
  {'note': 72, 'start': 16, 'noteLen': 16},
  {'note': 67, 'start': 32, 'noteLen': 32},
  {'note': 71, 'start': 32, 'noteLen': 32},
  {'note': 74, 'start': 32, 'noteLen': 32}
   ];

  for (let i of d3.range(60, 73)) {
    example_notes.push({'note': i, 'start': 64+(i-60)*4, 'noteLen': 4})
  }
  example_notes.push({'note': 60, 'start': 112, 'noteLen': 8})
  example_notes.push({'note': 61, 'start': 112, 'noteLen': 2})
  example_notes.push({'note': 62, 'start': 112, 'noteLen': 1})
  for (let n of example_notes) {
    n.end = n.start + n.noteLen;
  }
  return example_notes;
}

const starting_notes = preset_notes ? get_example_notes() : [];

class MiideaCanvas {

  constructor(notes, params, holder_div) {
    // Main components //
    this.notes = notes; // data
    this.p = params; // parameters
    this.s = {}; // state
    // Setting some parameters //
    this.p.time_buf = 50;
    this.p.note_buf = 30;
    // Setting up basic html / svg elements //
    this.holder_div = holder_div;
    this.svg = this.holder_div.attr('class', 'miidea_holder').append('svg')
      .attr('class', 'miidea_svg');
    this.cpanel = this.holder_div.append('div').attr('id', 'control_panel');
    this.s.started = false;
    this.s.start_time = 0;
    this.cpanel.append('button')
      .html('stop/start')
      .on('click', () => {
        if (this.s.started) {
          this.s.started = false;
        } else {
          this.s.started = true;
          this.s.start_time = performance.now();
        }
      });
    // creating gradients for sharps
    // https://observablehq.com/@jonhelfman/overlapping-svg-patterns
    const defs = this.svg.append('defs');
    for (let note of note_names) {
      let tmp = defs.append('pattern')
        .append('pattern')
        .attr('id', 'hatch-'+note)
        .attr('width', 4)
        .attr('height', 6)
        .attr('patternTransform', `rotate(-45)`)
        .attr('patternUnits', 'userSpaceOnUse') //used to make the pattern independent of location of circle
      tmp.append('rect')
        .attr('width', 8)
        .attr('height', 7)
        .style('fill', note_colors[note]);
      tmp.append('rect')
        .attr('y', 4)
        .attr('width', 8)
        .attr('height', 1)
        .style('fill', '#333333');
    }
    
  }

  set_params_from_global() {
    // Not sure about how this should work, but for now this sets
    // things based on the global vars
    this.p.width = width;
    this.p.height = height;
    this.p.vert = options.indexOf('Vertical')>-1;
    this.p.hover_harms = options.indexOf('Hover-Harmonies')>-1;
    this.p.show_key = options.indexOf('Show Key')>-1;
    this.p.note_exp = options.indexOf('Notation Experiment')>-1;
    this.p.color = options.indexOf('Color')>-1;
    this.p.chords = options.indexOf('Chords')>-1;
    this.p.key = key;
    this.svg.attr('width', this.p.width).attr('height', this.p.height)
    // Setting the ranges in pixels
    this.s.time_range = [0+this.p.time_buf, width-this.p.time_buf];
    this.s.note_range = [height-this.p.note_buf, 0+this.p.note_buf];
    // Setting defaults for the variables which will be used to build the domains
    this.s.bars = 0; // This will change to 1 on the first call to infer_params
    this.s.half_octave_range = [7, 10];
  }

  render_base_layer() {
    debug_text += ' render_base_layer ';
    // "Staff" lines to delineate note positions
    const all_notes = d3.range(this.s.note_domain[0]-1, this.s.note_domain[1]);
    this.svg.selectAll('.staff_line')
      .data(all_notes)
      .join('line')
        .attr('class', 'staff_line notation_element')
        .attr('x1', d => this.s.time_scale(this.s.time_domain[0]))
        .attr('x2', d => this.s.time_scale(this.s.time_domain[1]))
        .attr('y1', d => this.s.note_scale(d))
        .attr('y2', d => this.s.note_scale(d))
        .attr('stroke', '#555555')
        .attr('stroke-dasharray', d => ((d-24) % 12 == 6) ? '4' : '4 0') // middle line is dashed
        .attr('stroke-width', d => ((d-24) % 12 == 0) ? 3 : ((d-24) % 3 == 0) ? 1 : 0); 
        // line below C is thick, lines spaced by 3

    // I want the vertical bars to just go above the horizontal lines, so get them here:
    const horiz_lines = all_notes.filter(d => (d-24) % 3 == 0);
    this.svg.selectAll('.bar_line')
      .data(d3.range(1, this.s.bars))
      .join('line')
        .attr('class', 'bar_line notation_element')
        .attr('x1', d => this.s.time_scale(d*64))
        .attr('x2', d => this.s.time_scale(d*64))
        .attr('y1', d => this.s.note_scale(Math.max(...horiz_lines))-this.s.note_size)
        .attr('y2', d => this.s.note_scale(Math.min(...horiz_lines))+this.s.note_size)
        .attr('stroke', '#555555')
        .attr('stroke-width', 0.5);  

    // Little rectangles on the left side, showing thirds and fifths
    this.svg.selectAll('.harmony_line')
      .data(d3.range(...this.s.note_domain))
      .join('rect')
        .attr('class', 'harmony_line notation_element')
        .attr('x', d => this.s.time_scale(this.s.time_domain[0])-3*this.p.time_buf/4)
        .attr('width', this.p.time_buf/3) 
        .attr('y', d => this.s.note_scale(d+1)+3)
        .attr('height', this.s.note_size-6);
    // Rectangles behind the notes showing which are in the scale
    this.svg.selectAll('.key_line')
      .data(d3.range(...this.s.note_domain))
      .join('rect')
        .attr('class', 'key_line notation_element')
        .attr('x', d => this.s.time_scale(this.s.time_domain[0]))
        .attr('width', this.s.time_scale(this.s.time_domain[1])-this.s.time_scale(this.s.time_domain[0]))
        .attr('y', d => this.s.note_scale(d+1)+1)
        .attr('height', this.s.note_size-2)
        .classed('in_scale', d => this.p.show_key && in_scale(d, this.p.key)) // short-circuiting && here
        .classed('out_of_scale', d => this.p.show_key && (!in_scale(d, this.p.key)));
    // Labels for lines under C, marking the octave
    for (let note_num of d3.range(...this.s.note_domain)) {
      if ((note_num-24) % 12 == 0) { // It's a C
        this.svg.append('text')
          .attr('class', 'C_marker notation_element')
          .attr('x', this.p.note_buf-6)
          .attr('y', this.s.note_scale(note_num)+5)
          .attr('fill', '#555555')
          .attr('letter-spacing', 2)
          .html('C'+String((note_num-24) / 12));
      }
    }

    this.time_line = this.svg.append('line')
      .attr('class', 'time_line notation_element')
      .attr('x1', this.s.time_scale(this.s.time_domain[0]))
      .attr('x2', this.s.time_scale(this.s.time_domain[0]))
      .attr('y1', d => this.s.note_scale(Math.max(...horiz_lines))-this.s.note_size)
      .attr('y2', d => this.s.note_scale(Math.min(...horiz_lines))+this.s.note_size) 
      .attr('stroke', 'red')
      .style('display', this.s.started ? 'block' : 'none');
  }

  render_notes() {
    debug_text += ' render_notes ';
    if (this.p.chords) this.render_chord_notes();
    this.svg.selectAll('.note').remove();
    this.svg.selectAll('.note')
      .data(this.notes)
      .join(
        enter => {
          let outer = enter.append('g')
            .attr('class', 'note notation_element')
            .on('mouseover', (event, d) => {
              if (this.p.hover_harms) {
                d3.selectAll('.harmony_line')
                  .classed('third', td => (td - d.note == 4 || d.note - td == 8))
                  .classed('fifth', td => (td - d.note == 7 || d.note - td == 5))
                  .classed('octave', td => (td - d.note == 12 || d.note - td == 12 || td - d.note == 0));
                d3.selectAll('.note')
                  .classed('thirdNote', td => (td.note - d.note == 4 || d.note - td.note == 8))
                  .classed('fifthNote', td => (td.note - d.note == 7 || d.note - td.note == 5))
                  .classed('octaveNote', td => (td.note - d.note == 12 || d.note - td.note == 12 || td.note - d.note == 0));
              }
            })
            .on('mouseout', () => {
              d3.selectAll('.harmony_line').attr('class', 'harmony_line notation_element');
              d3.selectAll('.note').attr('class', 'note notation_element');
            })
            .style('fill', d => {
              if (!this.p.color) return '#333333';
              const note_name = get_note_name(d.note);
              const color_result = note_colors[note_name[0]];
              if (note_name.length == 1) {
                return color_result;
              } else {
                return 'url(#hatch-'+note_name[0]+')';
              }
            })
            //.call(drag)
          if (this.p.note_exp) {
            outer.append('rect')
              .attr('x', d => d.noteLen > 4 ? this.s.time_scale(d.start) + this.s.note_size/2 : this.s.time_scale(d.start))
              .attr('y', d => d.noteLen >= 8 ? this.s.note_scale(d.note+1)+this.s.note_size/3 : this.s.note_scale(d.note+1)+1)
              .attr('width', d => d.noteLen > 4 ?  this.s.time_scale(d.end)-this.s.time_scale(d.start)-this.s.note_size/2 : this.s.time_scale(d.end)-this.s.time_scale(d.start)-1)
              .attr('height', d => d.noteLen >= 8 ? this.s.note_size/3 : this.s.note_size-2)
              .attr('rx', d => d.noteLen == 4 || d.noteLen == 2 ? '50%' : 5)
              .attr('ry', d => d.noteLen == 4 ? 1 : d.noteLen == 2 ? '50%' : 0)
                
            outer.append('circle')
              .attr('cx', d => this.s.time_scale(d.start)+this.s.note_size/2)
              .attr('cy', d => this.s.note_scale(d.note+0.5))
              .attr('r', d => d.noteLen > 4 ? this.s.note_size/2 : 0);
          } else {
            let curr_time = this.s.time_scale(this.get_bars_time(performance.now()));
            outer.append('rect')
              .attr('x', d => this.s.time_scale(d.start))
              .attr('y', d => this.s.note_scale(d.note+1)+1)
              .attr('width', d => this.s.time_scale(d.end)-this.s.time_scale(d.start)-1)
              .attr('height', d => this.s.note_size-2);
          }
          outer.append('text')
            .attr('class', 'note_label')
            .attr('x', d => this.s.time_scale(d.start)+this.s.note_size/5)
            .attr('y', d => this.s.note_scale(d.note+0.5)+1)
            .attr('dominant-baseline', 'middle')
            .attr('letter-spacing', -1)
            .style('font-size', 3*this.s.note_size/4)
            .html(d => (this.s.note_size < this.s.time_scale(d.noteLen)-this.s.time_scale(0)) ? get_note_name(d.note) : '');
          
          return outer;
        },
        update => {
          if (this.p.note_exp) {
            update.select('rect')
              .attr('x', d => d.noteLen > 4 ? this.s.time_scale(d.start) + this.s.note_size/2 : this.s.time_scale(d.start))
              .attr('y', d => d.noteLen >= 8 ? this.s.note_scale(d.note+1)+this.s.note_size/3 : this.s.note_scale(d.note+1)+1)
              .attr('width', d => d.noteLen > 4 ?  this.s.time_scale(d.end)-this.s.time_scale(d.start)-this.s.note_size/2 : this.s.time_scale(d.end)-this.s.time_scale(d.start)-1)
              .attr('height', d => d.noteLen >= 8 ? this.s.note_size/3 : this.s.note_size-2)
              .attr('rx', d => d.noteLen == 4 || d.noteLen == 2 ? '50%' : 5)
              .attr('ry', d => d.noteLen == 4 ? 1 : d.noteLen == 2 ? '50%' : 0)
                
            update.select('circle')
              .attr('r', d => d.noteLen > 4 ? this.s.note_size/2 : 0);
          } else {
            let curr_time = this.s.time_scale(this.get_bars_time(performance.now()));
            update.select('rect')
              .attr('width', d => this.s.time_scale(d.end)-this.s.time_scale(d.start)-1);
          }
          update.select('text')
            .html(d => (this.s.note_size < this.s.time_scale(d.noteLen)-this.s.time_scale(0)) ? get_note_name(d.note) : '');
          return update;
        }
      );

  } 

  draw_chord(time, note, semitones) {
    /*
    if (semitones == 7) {
      this.draw_chord(time, note, 4);
      this.draw_chord(time, note+4, 3);
    } else if (semitones == 8) {
      this.draw_chord(time, note, 3);
      this.draw_chord(time, note+3, 5);
    } else {
    */
      // Going to construct this path literally, may the lord be with me
      let left = this.s.time_scale(time);
      let right = this.s.time_scale(time) + this.s.time_size*4;
      let bottom = this.s.note_scale(note+0.5);
      let top = this.s.note_scale(note+semitones+0.5);
      let middle = (top+bottom)/2;
      let path = 'M '+String(left)+' '+String(bottom)+' ';
      if (semitones == 5) { // fourth, pointy thing
        path += 'C '+String(left)+' '+String(middle)+' '+String(right)+' '+String(middle)+' ';
        path += String(right)+' '+String(middle)+' ';
        path += 'C '+String(right)+' '+String(middle)+' '+String(left)+' '+String(middle)+' ';
        path += String(left)+' '+String(top);
      } else if (semitones == 3 || semitones == 12) { // second, arc (also octaves like this, but will be obviously distinct)
        path += 'Q '+String(right)+' '+String(middle)+' '+String(left)+' '+String(top);
      } else if (semitones == 4) { // third, triangle
        path += 'L '+String(right)+' '+String(middle)+' L '+String(left)+' '+String(top);
      }
      this.svg.append('path')
        .attr('class', 'chord_mark notation_element chord_'+semitones)
        .attr('d', path)
        .attr('stroke', '#555555')
        .attr('stroke-width', 2)
        .attr('fill', 'none');
    //}
  }

  render_chord_notes() {
    debug_text += ' render_chord_notes ';
    // check for chords at any time
    // could in theory take in new notes to check for new notes chords rather than recheck everything
    // this may be slow...
    for (let t of d3.range(0, this.s.time_domain[1]+1)) {
      let notes_started_in_interval = this.notes.filter(d => d.start < t+1 && d.start >= t
                                                       ).map(d => d.note).sort();
      if (notes_started_in_interval.length > 0) { // we wont do anything if no notes started at this time
        let notes_in_interval = this.notes.filter(d => d.start < t+1 && d.start+d.noteLen > t
                                                 ).map(d => d.note).sort();
        for (let n of notes_in_interval) {
          let note_started = notes_started_in_interval.indexOf(n) > -1;
          for (let i of [3, 4, 5, 7, 8, 12]) {
            if (notes_in_interval.indexOf(n+i) > -1 && 
                (note_started || notes_started_in_interval.indexOf(n+i) > -1)) {
              this.draw_chord(t+0.5, n, i);
            }
          }
        }
      }
    } 
  }

  render_all() {
    debug_text += ' render_all ';
    this.svg.selectAll('.notation_element').remove();

    // making scales
    this.s.time_scale = d3.scaleLinear()
      .domain(this.s.time_domain)  // in 1/64 BARS
      .range(this.s.time_range);
    this.s.note_scale = d3.scaleLinear()
      .domain(this.s.note_domain) 
      .range(this.s.note_range);
    this.s.note_size = this.s.note_scale(1)-this.s.note_scale(2);
    this.s.time_size = this.s.time_scale(1)-this.s.time_scale(0);
    this.render_base_layer();
    this.render_notes();
    this.svg.classed('rotated', this.p.vert);
    if (this.p.vert) {
      this.holder_div.style('width', this.p.height+'px').style('height', this.p.width+'px');
      this.svg.selectAll('text').attr('rotate', 90).attr('transform', 'translate(0, -9)');
    }
    
  }

  get_bars_time(t) {
    let minutes = (t-this.s.start_time)/(60000);
    return Math.floor(minutes*(bpm*64/4)) % this.s.time_domain[1];
  }

  update_display() {
    debug_text += ' update_display ';
    // Infers the domains (time domain in 1/64 bars and the note domain in notes)
    // the time domain fits the # of bars with notes in them
    // the note domain fits based on the notes, in half octaves so it doesn't always change
    // const inferred_bars = this.notes.length === 0 ? 1 : Math.floor(Math.max(...this.notes.map(n => n.start))/64)+1;
    const inferred_bars = bars; // NOT INFERRING, JUST SETTING IT
    let inferred_hoct_range = this.s.half_octave_range; // default for if there are no notes
    if (this.notes.length > 0) {
      let note_vals = this.notes.map(n => n.note);
      //console.log(note_vals, Math.min(...note_vals)-21);
      inferred_hoct_range = [Math.floor((Math.min(...note_vals)-21)/6), 
                                   Math.ceil((Math.max(...note_vals)-21)/6)];
    }
    // if the layout has changed, we'll re-render
    //console.log('1', inferred_hoct_range);
    if (inferred_bars != this.s.bars || 
        inferred_hoct_range[0] != this.s.half_octave_range[0] || 
        inferred_hoct_range[1] != this.s.half_octave_range[1]) {
      //console.log('2');
      this.s.bars = inferred_bars;
      this.s.time_domain = [0, 64*this.s.bars];
      this.s.half_octave_range = inferred_hoct_range;
      this.s.note_domain = [this.s.half_octave_range[0]*6+18, 
                            this.s.half_octave_range[1]*6+21];
      //console.log(this.s.bars, this.s.half_octave_range);
      //console.log(this.s.time_domain, this.s.note_domain);

      this.render_all();
    } else {
      this.render_notes();
    }
    // no action if it didn't change the layout
  }

  animate() {
    if (this.notes.length>0) debug_text += this.notes[this.notes.length-1].note;
    d3.select('#note_debug').html(debug_text);
    debug_text = '';
    let bars_time = this.get_bars_time(performance.now());
    let curr_time = this.s.time_scale(bars_time);
    this.time_line
      .attr('x1', curr_time)
      .attr('x2', curr_time)
      .style('display', this.s.started ? 'block' : 'none');
    //this.render_notes();
    
    // If any notes are in progress, update the display
    let in_prog = this.notes.filter(n => n.in_progress);
    for (let note of in_prog) {
      note.end = bars_time;
      note.noteLen = bars_time - note.start;
    }
    if (in_prog.length > 0) this.update_display();

    // https://stackoverflow.com/questions/5911211/settimeout-inside-javascript-class-using-this
    requestAnimationFrame(this.animate.bind(this));
  }

}

const onload_action = () => {
  WebMidi
    .enable()
    .then(() => {
      // setting everything up...
      const m = new MiideaCanvas(starting_notes, {}, d3.select('#smi_canvas'));
      m.set_params_from_global();
      m.update_display();
      m.render_all();
      // midi input...
      for (const input of WebMidi.inputs) {
        console.log(input);
        input.addListener("noteon", "all", (event) => {
          // in_progress will signify an ongoing note
          m.notes.push({'note': event.note.number, 'start': m.get_bars_time(event.timestamp), 'noteLen': 0, 'in_progress': true});
          //console.log(m.notes);
          synth.triggerAttack(`${event.note.name}${event.note.octave}`, Tone.now());
        });
        input.addListener("noteoff", "all", (event) => {
          let note_num = event.note.number;
          // go find the note that just ended
          for (let i=0; i<m.notes.length; i++) {
            if (note_num === m.notes[m.notes.length-1-i].note) {
              m.notes[m.notes.length-1-i].end = m.get_bars_time(event.timestamp);
              m.notes[m.notes.length-1-i].noteLen = m.notes[m.notes.length-1-i].end-m.notes[m.notes.length-1-i].start;
              m.notes[m.notes.length-1-i].in_progress = false;
              break;
            }
          }
          synth.triggerRelease(
            [`${event.note.name}${event.note.octave}`],
            Tone.now()
          );
        });
      }
      // this call starts the animation loop
      m.animate();
    })
    .catch(err => alert(err));
}

