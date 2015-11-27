var gulp         = require('gulp');
var del          = require('del');
var zip          = require('gulp-zip');
var less         = require('gulp-less');
var cssmin       = require('gulp-cssmin');
var uglify       = require('gulp-uglify');
var autoprefixer = require('gulp-autoprefixer');
var jsonminify   = require('gulp-jsonminify');

del.sync('dist');

gulp.task('json', function () {
    return gulp.src(['manifest.json'])
        .pipe(jsonminify())
        .pipe(gulp.dest('dist'));
});

gulp.task('less', function () {
    return gulp.src(['css/prism.less', 'css/popup.less'])
        .pipe(less())
        .pipe(autoprefixer())
        .pipe(cssmin())
        .pipe(gulp.dest('dist/css'));
});

gulp.task('js', function () {
    return gulp.src(['**/*.js', '!node_modules/**', '!js/bugfree.js', '!gulpfile.js'])
        .pipe(uglify())
        .pipe(gulp.dest('dist'));
});

gulp.task('copy', function () {
    return gulp.src(['**/*.woff', '**/*.woff2', '**/*.png', '**/*.svg', '**/*.html', '**/bugfree.js', '**/flat-ui-min.css', '!node_modules/**'])
        .pipe(gulp.dest('dist'));
});

gulp.task('build', ['json', 'less', 'js', 'copy'], function () {
    return gulp.src('dist/**')
        .pipe(zip('archive.zip'))
        .pipe(gulp.dest('.'));
});

gulp.task('default', ['build']);
