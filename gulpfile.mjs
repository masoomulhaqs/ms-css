
import conventionalGithubReleaser from 'conventional-github-releaser';
import { Bumper } from 'conventional-recommended-bump';
import { execa } from 'execa';
import fs from 'fs';
import { dest, series, src, watch } from 'gulp';
import autoprefixer from 'gulp-autoprefixer';
import gulpClean from 'gulp-clean';
import cleanCss from 'gulp-clean-css';
import gulpIgnore from 'gulp-ignore';
import rename from 'gulp-rename';
import gulpSass from 'gulp-sass';
import sourcemaps from 'gulp-sourcemaps';
import * as dartSass from 'sass';
import { promisify } from 'util';

const sass = gulpSass(dartSass);

// Config

const config = {
    scss: {
        src: './scss/**/*.scss',
        dest: 'dist/css',
        sassOptions: {
            includePaths: ['./node_modules']
        }

    },
    docs: {
        assets: {
            dest: 'docs/assets/dist/css'
        }
    }
};


// Tasks

function clean() {
    return src(config.scss.dest, { read: false, allowEmpty: true })
        .pipe(gulpClean());
}

function css() {
    return src(config.scss.src)
        .pipe(sourcemaps.init())
        .pipe(sass(config.scss.sassOptions).on('error', sass.logError))
        .pipe(autoprefixer())
        .pipe(sourcemaps.write('.'))
        .pipe(dest(config.scss.dest))
        .pipe(cleanCss({
            specialComments: false
        }))
        .pipe(gulpIgnore.exclude(/.(\.css\.map)$/ig))
        .pipe(rename({ extname: '.min.css' }))
        .pipe(sourcemaps.write('.'))
        .pipe(dest(config.scss.dest));
}

function cleanDocs() {
    return src(config.docs.assets.dest, { read: false, allowEmpty: true })
        .pipe(gulpClean());
}

function copyDocs() {
    return src(config.scss.dest + '/**/*.css').pipe(
        dest(config.docs.assets.dest)
    )
}

// Conventional Changelog preset
const preset = 'angular';
// print output of commands into the terminal
const stdio = 'inherit';

async function bumpVersion() {
    const bumper = new Bumper(process.cwd()).loadPreset('angular')
    const recommendation = await bumper.bump()
    await execa('npm', ['version', recommendation.releaseType, '--no-git-tag-version'], {
        stdio,
    });

}

async function changelog() {
    await execa(
        'npx',
        [
            'conventional-changelog',
            '--preset',
            preset,
            '--infile',
            'CHANGELOG.md',
            '--same-file',
        ],
        { stdio }
    );
}

async function commitTagPush() {
    // even though we could get away with "require" in this case, we're taking the safe route
    // because "require" caches the value, so if we happen to use "require" again somewhere else
    // we wouldn't get the current value, but the value of the last time we called "require"
    const { version } = JSON.parse(await promisify(fs.readFile)('package.json'));
    const commitMsg = `chore: release ${version}`;
    await execa('git', ['add', '.'], { stdio });
    await execa('git', ['commit', '--message', commitMsg], { stdio });
    await execa('git', ['tag', `v${version}`], { stdio });
    await execa('git', ['push', '--follow-tags'], { stdio });
    await execa('git', ['push', 'origin', 'tag', `v${version}`], { stdio });
}

function githubRelease(done) {
    conventionalGithubReleaser(
        { type: 'oauth', token: process.env.GH_TOKEN, url: 'https://api.github.com/' },
        { preset },
        done
    );
}

export const docs = series(cleanDocs, copyDocs);
export const scss = series(css, cleanDocs, copyDocs);
export const build = series(clean, css, cleanDocs, copyDocs);

export const firstRelease = series(
    changelog,
    commitTagPush,
    githubRelease
);

export const release = series(
    build,
    bumpVersion,
    changelog,
    commitTagPush,
    githubRelease
);

export default function () {
    watch(config.scss.src, build)
};