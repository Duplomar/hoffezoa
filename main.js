import express from "express";
import crypto from "crypto";
import fs from "fs";
import zlib from "zlib"

const app = express()
app.disable('x-powered-by');
const port = 8000
const seed_salt = parseInt(process.env.seed_salt) || 42
const vid = 1;

class RNG {
    constructor(seed) {
        this.n = 624;
        this.m = 397;
        this.MATRIX_A = 0x9908b0df;
        this.UPPER_MASK = 0x80000000;
        this.LOWER_MASK = 0x7fffffff;
        this.state = new Array(this.n);
        this.index = this.n + 1;
        this.seed = seed;
        this._init(seed);
    }

    _init(seed) {
        this.state[0] = seed >>> 0;
        for (let i = 1; i < this.n; i++) {
            const s = this.state[i - 1] ^ (this.state[i - 1] >>> 30);
            this.state[i] = ((((s & 0xffff0000) >>> 16) * 1812433253) << 16) + (s & 0x0000ffff) * 1812433253 + i;
            this.state[i] >>>= 0; // Ensure unsigned
        }
    }

    _twist() {
        for (let i = 0; i < this.n; i++) {
            const x = (this.state[i] & this.UPPER_MASK) + (this.state[(i + 1) % this.n] & this.LOWER_MASK);
            let xA = x >>> 1;
            if (x % 2 !== 0) xA ^= this.MATRIX_A;
            this.state[i] = this.state[(i + this.m) % this.n] ^ xA;
        }
        this.index = 0;
    }

    // Returns a 32-bit unsigned integer
    nextInt(start = 0, end = 2**31) {
        if (this.index >= this.n) this._twist();
        let y = this.state[this.index++];
        y ^= y >>> 11;
        y ^= (y << 7) & 0x9d2c5680;
        y ^= (y << 15) & 0xefc60000;
        y ^= y >>> 18;
        return start + ((y >>> 0) % (end - start));
    }
}

function load_taxon_tree() {
    const data = JSON.parse(fs.readFileSync("./tree_en_ncbi.json", "utf-8"))
    return [
        data["tree"],
        data["leaf_start"]
    ]
}
const [taxon_tree, animal_start_index] = load_taxon_tree()
const taxon_length = 100
const page_template = fs.readFileSync(
    "./page.html", 
    "utf-8"
).replace(
    "{{ animal_start_index }}", 
    "" + animal_start_index
).replace(
    "{{ taxon_tree }}", 
    JSON.stringify(taxon_tree)
).replace(
    "{{ vid }}",
    vid
)

let replace_time = new Date()
let expire_str = replace_time.toUTCString()

let todays_taxons = [];
let todays_animal_index = -1;
let yesterdays_animal_index = -1;

let salt = 0;
let page = "";
let page_br = "";


function create_hash(text) {
    return crypto.createHash('sha512').update(text).digest("base64")
}

function set_todays_animal(){
    const today = replace_time.toISOString().split('T')[0]
    let today_num = 0
    for (let i = 0; i < today.length; i++) 
        today_num += today.charCodeAt(i) * (2**i)
    
    const rng_generator = new RNG(today_num + seed_salt)

    salt = rng_generator.nextInt()
    todays_taxons = []

    let i = rng_generator.nextInt(animal_start_index, taxon_tree.length)
    yesterdays_animal_index = todays_animal_index
    todays_animal_index = i
    while (i) {
        const [taxon_names, parent] = taxon_tree[i]
        todays_taxons.push(taxon_names[0])
        i = parent
    }
    todays_taxons.push(taxon_tree[0][0][0])

    todays_taxons = todays_taxons.reverse().map(
        (taxon, i) =>{
            return create_hash(`${i};${salt};${taxon}`)
        }
    )
    while (todays_taxons.length < taxon_length) {
        todays_taxons.push(create_hash(crypto.randomBytes(32)))
    }

    page = page_template.replace(
        "{{ salt }}", 
        "" + salt
    ).replace(
        "{{ animal_start_index }}", 
        "" + animal_start_index
    ).replace(
        "{{ yesterdays_animal_index }}", 
        "" + yesterdays_animal_index
    ).replace(
        "{{ todays_taxons }}", 
        JSON.stringify(todays_taxons)
    ).replace(
        "{{ today }}", 
        today
    )

    page_br = zlib.brotliCompressSync(Buffer.from(page));
    replace_time.setDate(replace_time.getDate() + 1)
    expire_str = replace_time.toUTCString()
}

function schedule_new_animal(hour, minute) {
    const now = new Date();
    const next = new Date();

    next.setHours(hour, minute, 0, 0);

    if (next <= now) 
        next.setDate(next.getDate() + 1);

    replace_time = next
    expire_str = replace_time.toUTCString()

    const delay = next - now;
    setTimeout( 
        () => {
            set_todays_animal();
            setInterval(set_todays_animal, 24 * 60 * 60 * 1000);
        }, 
        delay
    );

}

set_todays_animal()
schedule_new_animal(0, 0)

app.get('/', (req, res) => {
    res.set('Expires', expire_str);

    const enc = req.headers['accept-encoding'] || '';
    if (enc.includes('br')) {
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Content-Encoding', 'br');
        res.set('Vary', 'Accept-Encoding');
        res.send(page_br);
    }
    else
        res.send(page)
})

app.listen(port, () => {console.log(`Metazoa running at ${port}`)})
